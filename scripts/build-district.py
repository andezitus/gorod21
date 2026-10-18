"""Offline preparation of the user-selected OSM district; no runtime dependency."""
import argparse,json,math,heapq
from pathlib import Path
from PIL import Image
import numpy as np
from scipy import ndimage
from shapely.geometry import Polygon,LineString,Point,MultiPoint,mapping
from shapely.ops import unary_union,linemerge,nearest_points,polygonize
import xml.etree.ElementTree as ET
from utility_network import clean_branches

parser=argparse.ArgumentParser()
parser.add_argument('--osm',required=True);parser.add_argument('--reference',required=True)
parser.add_argument('--output',default=str(Path(__file__).resolve().parents[1]))
a=parser.parse_args();out=Path(a.output)
# The screenshot uses OSM zoom 15. Anchor: Elgera / Maksima Gorkogo junction.
PX_PER_DEGREE=256*2**15/360
ANCHOR_LON,ANCHOR_LAT,ANCHOR_X,ANCHOR_Y=47.1780559,56.148839,432.,40.
def merc(lat):return math.degrees(math.log(math.tan(math.pi/4+math.radians(lat)/2)))
def to_pixel(c):return ((c[0]-ANCHOR_LON)*PX_PER_DEGREE+ANCHOR_X,(merc(ANCHOR_LAT)-merc(c[1]))*PX_PER_DEGREE+ANCHOR_Y)
def to_geo(p):
 lon=ANCHOR_LON+(p[0]-ANCHOR_X)/PX_PER_DEGREE
 lat=math.degrees(2*math.atan(math.exp(math.radians(merc(ANCHOR_LAT)-(p[1]-ANCHOR_Y)/PX_PER_DEGREE)))-math.pi/2)
 return [lon,lat]
# Find the actual hand-drawn outline, excluding the much smaller red POI symbols.
im=np.asarray(Image.open(a.reference).convert('RGB'))
red=(im[:,:,0]>235)&(im[:,:,1]<85)&(im[:,:,2]<85)
cc,n=ndimage.label(red);sizes=np.bincount(cc.ravel());sizes[0]=0
outline=cc==int(sizes.argmax());outline=ndimage.binary_closing(outline,iterations=2)
filled=ndimage.binary_fill_holes(outline)
if filled.sum()<150000:raise ValueError('The red perimeter is not closed')
# Trace the filled polygon with a marching boundary made from row spans.
from shapely.geometry import box
spans=[]
for y in range(filled.shape[0]):
 xs=np.flatnonzero(filled[y])
 if len(xs):spans.append(box(float(xs.min()),float(y),float(xs.max()+1),float(y+1)))
district=unary_union(spans).simplify(2.2,preserve_topology=True)
if district.geom_type!='Polygon':district=max(district.geoms,key=lambda g:g.area)
# Irregular forest fringe. Layered transparent contours soften the edge without filters.
coast=district.buffer(93,resolution=12).segmentize(12)
coords=list(coast.exterior.coords);deformed=[]
for i,p in enumerate(coords[:-1]):
 angle=math.atan2(p[1]-coast.centroid.y,p[0]-coast.centroid.x)
 delta=23*math.sin(angle*9+.8)+13*math.sin(angle*19+1.9)+7*math.sin(angle*37+.4)
 deformed.append((p[0]+math.cos(angle)*delta,p[1]+math.sin(angle)*delta))
island=Polygon(deformed).buffer(0)
x0,y0,x1,y1=island.buffer(20).bounds
W=1080.;scale=W/(x1-x0);H=(y1-y0)*scale
norm=lambda p:[round((p[0]-x0)*scale,2),round((p[1]-y0)*scale,2)]
poly_points=lambda p:[norm(c) for c in list(p.exterior.coords)[:-1]]

def pieces(g,kind):
 if g.is_empty:return []
 if g.geom_type==kind:return [g]
 if hasattr(g,'geoms'):return [p for q in g.geoms for p in pieces(q,kind)]
 return []
root=ET.parse(a.osm).getroot();nodes={n.attrib['id']:(float(n.attrib['lon']),float(n.attrib['lat'])) for n in root.findall('node')}
ways={w.attrib['id']:w for w in root.findall('way')}
def tags(e):return {t.attrib['k']:t.attrib['v'] for t in e.findall('tag')}
def coords_of(w):return [to_pixel(nodes[n.attrib['ref']]) for n in w.findall('nd') if n.attrib['ref'] in nodes]
roads=[];buildings=[];parks=[];forest=[];water=[];pois=[]
allowed={'primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','residential','unclassified','living_street','pedestrian','service','footway','path','steps','cycleway'}
for wid,w in ways.items():
 t=tags(w);c=coords_of(w)
 if len(c)<2:continue
 if t.get('highway') in allowed:
  geom=LineString(c).intersection(district).simplify(.45)
  for i,p in enumerate(pieces(geom,'LineString')):
   if p.length<1.4:continue
   k=t['highway'].replace('_link','')
   if k in ('path','steps','cycleway'):k='footway'
   roads.append({'id':wid+(f'-{i}' if i else ''),'p':[norm(v) for v in p.coords],'k':k,'n':t.get('name',''),'b':t.get('bridge')=='yes'})
 if len(c)<4 or c[0]!=c[-1]:continue
 polygon=Polygon(c).buffer(0)
 if 'building' in t and t['building'] not in ('roof','construction'):
  for i,p in enumerate(pieces(polygon.intersection(district).simplify(.45,preserve_topology=True),'Polygon')):
   if p.area<13:continue
   try:height=float(t.get('height',str(float(t.get('building:levels',3))*3)).replace(' m',''))
   except ValueError:height=12
   address=' '.join(filter(None,[t.get('addr:street',''),t.get('addr:housenumber','')]))
   buildings.append({'id':wid+(f'-{i}' if i else ''),'p':poly_points(p),'h':round(max(6,min(34,height*.72)),1),'a':address,'kind':t['building']})
 if t.get('landuse') in ('grass','forest','recreation_ground','meadow') or t.get('leisure') in ('park','garden','pitch') or t.get('natural') in ('wood','scrub'):
  for p in pieces(polygon.intersection(district).simplify(1.1,preserve_topology=True),'Polygon'):
   if p.area>50:
    parks.append(poly_points(p))
    if t.get('landuse')=='forest' or t.get('natural') in ('wood','scrub'):forest.append(p)
 if t.get('natural')=='water':
  for p in pieces(polygon.intersection(district).simplify(.8),'Polygon'):
   if p.area>15:water.append({'n':t.get('name',''),'p':poly_points(p)})
 if t.get('amenity')=='school' and district.covers(polygon.centroid):
  label=t.get('short_name') or t.get('name','')
  if label:pois.append({'p':norm(polygon.centroid.coords[0]),'t':label})
# OSM groves and lawns often use relations with several outer/inner rings.
for relation in root.findall('relation'):
 t=tags(relation)
 is_forest=t.get('landuse')=='forest' or t.get('natural') in ('wood','scrub')
 if not (is_forest or t.get('landuse') in ('grass','meadow') or t.get('leisure') in ('park','garden')):continue
 rings={'outer':[],'inner':[]}
 for member in relation.findall('member'):
  if member.attrib.get('type')!='way' or member.attrib['ref'] not in ways:continue
  c=coords_of(ways[member.attrib['ref']]);role=member.attrib.get('role') or 'outer'
  if len(c)>1 and role in rings:rings[role].append(LineString(c))
 if not rings['outer']:continue
 outer=unary_union(list(polygonize(unary_union(rings['outer']))))
 inner=unary_union(list(polygonize(unary_union(rings['inner'])))) if rings['inner'] else Polygon()
 geometry=outer.difference(inner).intersection(district).simplify(1.1,preserve_topology=True)
 for p in pieces(geometry,'Polygon'):
  if p.area>50:
   parks.append(poly_points(p))
   if is_forest:forest.append(p)
# A small, explicit water-main graph, centered on the streets in the supplied plan.
# These are illustrative utility routes, not an assertion of actual Vodokanal assets.
axes=[
 ('проспект Максима Горького',[(278,40),(724,40)]),
 ('Университетская улица',[(278,40),(244,116),(198,207),(153,288),(113,368),(90,439),(87,503),(96,568),(120,641),(147,707),(194,761)]),
 ('улица Тимофея Кривова',[(724,40),(724,78),(757,135),(819,232),(877,324),(910,374)]),
 ('улица Гузовского',[(614,40),(614,173),(614,360),(622,396),(657,441),(715,498)]),
 ('улица Эльгера',[(432,40),(432,392)]),
 ('улица Ахазова',[(201,218),(432,218)]),
 ('улица Мичмана Павлова',[(92,541),(192,490),(278,448),(366,407),(464,391),(614,374),(711,335),(829,254)]),
 ('Ядринское шоссе',[(194,761),(306,626),(494,567),(715,498)]),
 ('Московский проспект',[(715,498),(910,374)])]
axis_lines=[LineString(c) for name,c in axes]
lines=[]
for index,line in enumerate(axis_lines):
 coordinates=list(line.coords)
 for endpoint in (0,-1):
  point=Point(coordinates[endpoint]);others=[g for j,g in enumerate(axis_lines) if j!=index]
  target=min(others,key=lambda g:g.distance(point))
  if 0<target.distance(point)<12:coordinates[endpoint]=nearest_points(point,target)[1].coords[0]
 lines.append(LineString(coordinates).intersection(district.buffer(-1)))
# One label on the longest continuous geometry of each named street.
label_names=['проспект Максима Горького','Университетская улица','улица Тимофея Кривова','улица Гузовского','улица Эльгера','улица Ахазова','улица Мичмана Павлова','Ядринское шоссе','Московский проспект']
labels=[]
for name,c in axes:
 source=[LineString(r['p']) for r in roads if r['n']==name]
 # The central label axis follows the screenshot and avoids duplicate carriageway labels.
 p=LineString([norm(v) for v in c]).intersection(Polygon(poly_points(district)))
 if p.is_empty:continue
 longest=max(pieces(p,'LineString'),key=lambda x:x.length)
 labels.append({'id':'street-'+str(len(labels)),'p':[[round(x,2),round(y,2)] for x,y in longest.coords],'t':name,'size':8.5 if name=='улица Ахазова' else 9})
# Fit the urban fill to the perimeter carriageways, rather than the red pen margin.
perimeter=[axes[0],axes[2],axes[8],(axes[7][0],list(reversed(axes[7][1]))),(axes[1][0],list(reversed(axes[1][1])))]
ring=[]
for name,points in perimeter:
 carriageways=[LineString(coords_of(w)) for w in ways.values() if tags(w).get('name')==name and tags(w).get('highway') in allowed]
 road_geometry=unary_union(carriageways)
 axis=LineString(points)
 for distance in np.linspace(0,axis.length,max(2,math.ceil(axis.length/12))):
  point=axis.interpolate(float(distance));nearest=nearest_points(point,road_geometry)[1]
  candidates=[nearest_points(point,road)[1] for road in carriageways]
  candidates=[p for p in candidates if p.distance(point)<=nearest.distance(point)+12]
  outward=(point.x-district.centroid.x,point.y-district.centroid.y)
  outer=max(candidates,key=lambda p:(p.x-point.x)*outward[0]+(p.y-point.y)*outward[1])
  ring.append(outer.coords[0] if nearest.distance(point)<45 else point.coords[0])
urban=Polygon(ring).buffer(0)
if urban.geom_type!='Polygon':urban=max(urban.geoms,key=lambda p:p.area)
# Keep urban objects inside the outside carriageways. The half-width allowance
# includes the perimeter roads themselves; all vacated ground stays forest green.
city_boundary=Polygon(poly_points(urban)).buffer(4.5,join_style=2)
def clip_items(items,kind):
 result=[]
 for item in items:
  geometry=Polygon(item['p']) if kind=='Polygon' else LineString(item['p'])
  for index,part in enumerate(pieces(geometry.intersection(city_boundary),kind)):
   if (part.area if kind=='Polygon' else part.length)<.1:continue
   coords=list(part.exterior.coords)[:-1] if kind=='Polygon' else list(part.coords)
   result.append({**item,'id':item.get('id','')+(f'-clip{index}' if index else ''),'p':[[round(x,2),round(y,2)] for x,y in coords]})
 return result
roads=clip_items(roads,'LineString');buildings=clip_items(buildings,'Polygon')
parks=[item['p'] for item in clip_items([{'p':p} for p in parks],'Polygon')]
forest_areas=[item['p'] for item in clip_items([{'p':poly_points(p)} for p in forest],'Polygon')]
water=clip_items(water,'Polygon')
raw_boundary=urban.buffer(4.5/scale,join_style=2)
lines=[line.intersection(raw_boundary) for line in lines]
# Node every junction and dissolve coincident segments: each atomic edge is stored once.
network=[]
for i,line in enumerate(pieces(unary_union(lines),'LineString')):
 if line.length<1:continue
 mid=line.interpolate(.5,normalized=True)
 name=axes[min(range(len(lines)),key=lambda j:lines[j].distance(mid))][0]
 network.append({'id':'main-'+str(i),'p':[norm(p) for p in line.coords],'n':name,'k':'primary' if name in ('Ядринское шоссе','Московский проспект') else 'secondary'})
# House feeds are routed offline through the access-road graph. Browser receives only
# the used, dissolved edges: no pathfinding, duplicate strokes or animation at runtime.
mains=unary_union(lines)
corridors=[LineString([((p[0]/scale)+x0,(p[1]/scale)+y0) for p in road['p']]) for road in roads if road['k'] in ('service','residential','unclassified','living_street')]
connectors=[]
for corridor in corridors:
 for endpoint in (corridor.coords[0],corridor.coords[-1]):
  point=Point(endpoint);target=nearest_points(point,mains)[1]
  if .01<point.distance(target)<28:connectors.append(LineString([point,target]))
base=unary_union([mains,*corridors,*connectors])
feeds=[]
for building in buildings:
 polygon=Polygon([((p[0]/scale)+x0,(p[1]/scale)+y0) for p in building['p']])
 wall,attachment=nearest_points(polygon,base)
 if wall.distance(attachment)>.05:feeds.append((building['id'],LineString([attachment,wall])))
 else:feeds.append((building['id'],LineString([attachment,polygon.exterior.interpolate(polygon.exterior.project(attachment))])))
graph_geometry=unary_union([base,*[line for _,line in feeds if line.length>.01]])
edges=[];graph={}
key=lambda p:(round(p[0],5),round(p[1],5))
for line in pieces(graph_geometry,'LineString'):
 if line.length<.01:continue
 index=len(edges);edges.append(line);start,end=key(line.coords[0]),key(line.coords[-1])
 graph.setdefault(start,[]).append((end,line.length,index));graph.setdefault(end,[]).append((start,line.length,index))
distance={};parent={};queue=[]
for node in graph:
 if mains.distance(Point(node))<.001:distance[node]=0;heapq.heappush(queue,(0,node))
while queue:
 cost,node=heapq.heappop(queue)
 if cost!=distance[node]:continue
 for neighbor,length,index in graph[node]:
  candidate=cost+length
  if candidate<distance.get(neighbor,float('inf')):
   distance[neighbor]=candidate;parent[neighbor]=(node,index);heapq.heappush(queue,(candidate,neighbor))
used=set();house_connections=[]
for bid,feed in feeds:
 endpoint=key(feed.coords[-1])
 if endpoint not in distance:continue
 node=endpoint
 while node in parent:
  node,index=parent[node];used.add(index)
 house_connections.append({'building':bid,'p':norm(feed.coords[-1]),'root':norm(node)})
branch_geometry=unary_union([edges[index] for index in used]).difference(mains)
# Each downstream edge carries the precise source junction on a main, so a
# scenario colors its attached tree rather than unrelated nearby branches.
roots={}
for index in used:
 edge=edges[index];ends=[key(edge.coords[0]),key(edge.coords[-1])]
 node=max(ends,key=lambda p:distance.get(p,0))
 while node in parent:node=parent[node][0]
 roots[index]=node
branches=[]
for line in pieces(branch_geometry.intersection(raw_boundary),'LineString'):
 if line.length<.1:continue
 midpoint=line.interpolate(.5,normalized=True)
 edge_index=min(used,key=lambda i:edges[i].distance(midpoint))
 branches.append({'id':'feed-'+str(len(branches)),'p':[norm(p) for p in line.coords],'root':norm(roots[edge_index])})
trees=[]
soft=[]
geo_sw=to_geo((x0,y1));geo_ne=to_geo((x1,y0))
landmarks={name:norm(p) for name,p in {'water':(432,370),'heat':(614,175),'outage':(345,40),'yard':(320,280),'sidewalk':(145,330),'facade':(505,290),'light':(570,40),'roof':(330,193)}.items()}
# The utility main follows the full University Street axis. Its source corridor
# extends slightly beyond the urban road mask; clipping it to that mask removed
# the central section. Restore this main after branch routing so existing feeds
# and scenario attachments retain their exact geometry and provenance.
university_main=LineString(axes[1][1])
network_geometry=unary_union([*lines,university_main])
network=[]
for line in pieces(network_geometry,'LineString'):
 if line.length<1:continue
 mid=line.interpolate(.5,normalized=True)
 name=axes[min(range(len(axis_lines)),key=lambda j:axis_lines[j].distance(mid))][0]
 network.append({'id':'main-'+str(len(network)),'p':[norm(p) for p in line.coords],'n':name,'k':'primary' if name in ('Ядринское шоссе','Московский проспект') else 'secondary'})
network_boundary=raw_boundary.union(university_main.buffer(6/scale))
# Suppress walking/access paths in the Guzovsky grove in the visual map only.
# Their original geometry remains available to existing search/network logic.
grove=max((Polygon(p) for p in forest_areas if Polygon(p).covers(Point(norm((426,530))))),key=lambda p:p.area)
for road in roads:
 if road['k'] in ('primary','secondary','tertiary'):continue
 line=LineString(road['p'])
 if not line.intersects(grove):continue
 road['visibleP']=[[[round(x,2),round(y,2)] for x,y in part.coords] for part in pieces(line.difference(grove.buffer(.75)),'LineString') if part.length>.1]
data={'id':'cheboksary-island-v3','name':'Чебоксары','bounds':[geo_sw[0],geo_sw[1],geo_ne[0],geo_ne[1]],'mercator':True,'w':W,'h':round(H,2),'projection':{'angle':-18,'scale':.8,'vertical':.57,'flatVertical':.78},'buildings':buildings,'roads':roads,'parks':parks,'water':water,'district':poly_points(district),'urbanBoundary':poly_points(urban),'cityBoundary':[[round(x,2),round(y,2)] for x,y in list(city_boundary.exterior.coords)[:-1]],'forestAreas':forest_areas,'groveBoundary':[[round(x,2),round(y,2)] for x,y in list(grove.exterior.coords)[:-1]],'island':poly_points(island),'coast':soft,'trees':trees,'streetLabels':labels,'areaLabels':[{'p':norm((426,530)),'t':'Роща Гузовского','size':10}],'landmarks':landmarks,'networkBoundary':poly_points(network_boundary),'network':{'routes':network,'branches':branches,'houseConnections':house_connections,'illustrative':True},'source':{'name':'OpenStreetMap','url':'https://api.openstreetmap.org/api/0.6/map?bbox=47.155,56.13,47.205,56.16','date':'2026-10-17','selection':'User-provided red perimeter; OSM zoom 15, Elgera/Gorkogo control point','license':'ODbL-1.0'}}
data['network']=clean_branches(data['network'],buildings)
data['coast']=[]
out.mkdir(parents=True,exist_ok=True)
(out/'city-data.js').write_text('window.CITY_DATA='+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n')
(out/'data').mkdir(exist_ok=True)
(out/'data/district-boundary.geojson').write_text(json.dumps({'type':'Feature','properties':{'name':data['name'],'source':'User red outline georeferenced to OpenStreetMap'},'geometry':{'type':'Polygon','coordinates':[[to_geo(c) for c in district.exterior.coords]]}},ensure_ascii=False,indent=2))
print(json.dumps({'buildings':len(buildings),'roads':len(roads),'parks':len(parks),'pipes':len(network),'branches':len(data['network']['branches']),'connectedHouses':len(data['network']['houseConnections']),'trees':0,'streetLabels':[l['t'] for l in labels],'world':[W,round(H)],'selectionPixels':district.bounds,'bounds':data['bounds'],'bytes':(out/'city-data.js').stat().st_size},ensure_ascii=False,indent=2))
