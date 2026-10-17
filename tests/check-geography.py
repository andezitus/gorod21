"""Optional offline geometry checks. Requires Shapely, not used by the website."""
import json
from pathlib import Path
from shapely.geometry import Polygon,LineString,Point
from shapely.ops import unary_union
root=Path(__file__).resolve().parents[1]
s=(root/'city-data.js').read_text();data=json.loads(s[len('window.CITY_DATA='):-2])
selection=Polygon(data['district']);island=Polygon(data['island'])
tolerance=selection.buffer(.025)
assert island.covers(selection)
city=Polygon(data['cityBoundary']).buffer(.025)
for building in data['buildings']:assert city.covers(Polygon(building['p'])),building['id']
for road in data['roads']:assert city.covers(LineString(road['p'])),road['id']
for polygon in data['parks']+data['forestAreas']:assert city.covers(Polygon(polygon))
network_extent=Polygon(data.get('networkBoundary',data['cityBoundary'])).buffer(.025)
for route in data['network']['routes']+data['network']['branches']:assert network_extent.covers(LineString(route['p'])),route['id']
mains=unary_union([LineString(route['p']) for route in data['network']['routes']])
for branch in data['network']['branches']:assert mains.distance(Point(branch['root']))<.04
assert island.area>Polygon(data['cityBoundary']).area*1.2
for building in data['buildings']:assert tolerance.covers(Polygon(building['p'])),building['id']
for road in data['roads']:assert tolerance.covers(LineString(road['p'])),road['id']
for group in data['trees']:
 for x,y,radius in group:assert island.covers(Point(x,y))
lines=[LineString(route['p']) for route in data['network']['routes']+data['network']['branches']]
for index,line in enumerate(lines):
 for other in lines[:index]:assert line.intersection(other).length<.001
assert abs(sum(line.length for line in lines)-unary_union(lines).length)<.001
assert len(data['network']['houseConnections'])>150
for connection in data['network']['houseConnections']:
 building=next(b for b in data['buildings'] if b['id']==connection['building'])
 assert Polygon(building['p']).boundary.distance(Point(connection['p']))<.025
 assert unary_union(lines).distance(Point(connection['p']))<.025
print('Passed: selection boundary, island containment, roads/buildings, forest and non-overlapping utility graph.')

# Visual paths are clipped from the grove, while their original p remains intact.
grove=Polygon(data['groveBoundary'])
trimmed=[road for road in data['roads'] if 'visibleP' in road]
assert len(trimmed)>30
for road in trimmed:
 for points in road['visibleP']:assert LineString(points).intersection(grove).length<.025
print('Passed: grove paths suppressed without removing source roads.')

# A road-boundary clip must never remove the University Street utility main.
university=LineString(next(label['p'] for label in data['streetLabels'] if label['t']=='Университетская улица'))
assert university.difference(mains.buffer(.025)).length<.025
print('Passed: University Street main has no missing interval and fits the utility clip.')
