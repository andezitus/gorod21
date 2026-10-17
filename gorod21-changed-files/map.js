/* Geographic rendering uses OSM building footprints and roads. Utility lines are illustrative. */
(function () {
  'use strict';
  const W = 1200, H = 880;
  const uiScale = () => parseFloat(window.getComputedStyle?.(document.documentElement)?.getPropertyValue('--ui-scale')) || 1;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const round = n => Math.round(n * 100) / 100;
  const ROAD_WIDTHS={primary:7,secondary:5.4,tertiary:4,residential:2.6,unclassified:2.6,living_street:2.1,pedestrian:1.3,service:1.1,footway:.6};
  const buildingModels = new WeakMap();
  const networkModels = new WeakMap();
  const sceneModels = new WeakMap();
  const paintedNetworks = new WeakMap();
  // Blue tones match the interface; true forest areas keep their green fill.
  const palette = {
    land:'#edf3fc', park:'#e1ebfa', parkEdge:'#ceddf3', forest:'#dce7c8',
    water:'#c8def9', waterEdge:'#9bbce9',
    roof:'#dceaff', wall:'#9ebde8', roofEdge:'#7b9fce',
    serviceRoof:'#c3d8f4', serviceWall:'#88aadb',
    road:'#a7bedc', path:'#c4d5ec', activeRoad:'#7497c5',
    pipe:'#6f96c7', branch:'#91aed4', light:'#6187ba', label:'#486b9a',
    slab:'#9cb6dc', slabEdge:'#c2d4ee'
  };

  function project(p, z = 0, options = {}) {
    const d = window.CITY_DATA;
    const settings=d.projection||{};
    const a = options.flat ? 0 : (settings.angle??-24) * Math.PI / 180;
    const x = p[0] - d.w / 2, y = p[1] - d.h / 2;
    const rx = x * Math.cos(a) - y * Math.sin(a);
    const ry = x * Math.sin(a) + y * Math.cos(a);
    return [round(600 + rx * (settings.scale??.91)), round(438 + ry * (options.flat ? (settings.flatVertical??.88) : (settings.vertical??.61)) - (options.flat ? 0 : z))];
  }
  function path(points, z, opt, close = false) {
    return points.map((p, i) => {const c = project(p, z, opt);return `${i ? 'L' : 'M'}${c[0]},${c[1]}`;}).join('') + (close ? 'Z' : '');
  }
  function center(poly) {return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];}
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  function buildingModel(building) {
    let model = buildingModels.get(building);
    if (!model || model.source !== building.p) {
      const points = building.p.filter((point, index, list) => !index || dist(point, list[index - 1]) > .001);
      if (points.length > 1 && dist(points[0], points[points.length - 1]) < .001) points.pop();
      const area = points.reduce((sum, point, index) => {
        const next = points[(index + 1) % points.length];
        return sum + point[0] * next[1] - next[0] * point[1];
      }, 0);
      // Normalize the winding so near-facing walls close the volume on every footprint.
      model = {source:building.p, point:center(building.p), points:area < 0 ? points.reverse() : points};
      buildingModels.set(building, model);
    }
    return model;
  }
  function nearestBuilding(p) {
    let min = Infinity, best = null;
    for (const b of window.CITY_DATA.buildings) {const n = dist(p, buildingModel(b).point);if (n < min) {min = n;best = b;}}
    return best;
  }
  function nearestRoadPoint(name, target) {
    let best = target, distance = Infinity;
    for (const road of window.CITY_DATA.roads) if (road.n === name) for (const p of road.p) {const d = dist(p, target);if (d < distance) {distance = d;best = p;}}
    return [...best];
  }
  function nearestPointOnSegment(point, start, end) {
    const dx=end[0]-start[0],dy=end[1]-start[1],lengthSquared=dx*dx+dy*dy;
    const t=lengthSquared?Math.max(0,Math.min(1,((point[0]-start[0])*dx+(point[1]-start[1])*dy)/lengthSquared)):0;
    const projected=[start[0]+dx*t,start[1]+dy*t];
    return {point:projected,t,distance:dist(point,projected)};
  }
  function nearestPolylinePoint(point, points) {
    let best={point:[...points[0]],segmentIndex:0,t:0,distance:dist(point,points[0])};
    for(let i=0;i<points.length-1;i++){
      const projected=nearestPointOnSegment(point,points[i],points[i+1]);
      if(projected.distance<best.distance)best={...projected,segmentIndex:i};
    }
    return best;
  }
  function pointAtDistance(points,cumulative,distance) {
    if(distance<=0)return [...points[0]];
    for(let i=0;i<cumulative.length-1;i++){
      if(distance>cumulative[i+1])continue;
      const length=cumulative[i+1]-cumulative[i],t=length?(distance-cumulative[i])/length:0;
      return [points[i][0]+(points[i+1][0]-points[i][0])*t,points[i][1]+(points[i+1][1]-points[i][1])*t];
    }
    return [...points[points.length-1]];
  }
  function slicePolylineAround(points, location, radius) {
    if(points.length<2)return points.map(point=>[...point]);
    const cumulative=[0];
    for(let i=1;i<points.length;i++)cumulative.push(cumulative[i-1]+dist(points[i-1],points[i]));
    const position=cumulative[location.segmentIndex]+dist(points[location.segmentIndex],location.point);
    const start=Math.max(0,position-radius),end=Math.min(cumulative[cumulative.length-1],position+radius);
    const slice=[pointAtDistance(points,cumulative,start)];
    for(let i=1;i<points.length-1;i++)if(cumulative[i]>start&&cumulative[i]<end)slice.push([...points[i]]);
    slice.push(pointAtDistance(points,cumulative,end));
    return slice;
  }
  function branchPathFromEndpoint(points, endpointIndex, maxLength) {
    const route=endpointIndex===0?points:[...points].reverse(),branch=[[...route[0]]];
    let remaining=maxLength;
    for(let i=1;i<route.length&&remaining>0;i++){
      const length=dist(route[i-1],route[i]);
      if(length<=remaining){branch.push([...route[i]]);remaining-=length;}
      else{const t=remaining/length;branch.push([route[i-1][0]+(route[i][0]-route[i-1][0])*t,route[i-1][1]+(route[i][1]-route[i-1][1])*t]);}
    }
    return branch;
  }
  function segmentIndex(roads, cellSize = 64) {
    const cells = new Map();
    let order = 0;
    for (const road of roads) for (let i = 0; i < road.p.length - 1; i++) {
      const start = road.p[i], end = road.p[i + 1], segment = {start, end, order:order++};
      const x0 = Math.floor(Math.min(start[0], end[0]) / cellSize), x1 = Math.floor(Math.max(start[0], end[0]) / cellSize);
      const y0 = Math.floor(Math.min(start[1], end[1]) / cellSize), y1 = Math.floor(Math.max(start[1], end[1]) / cellSize);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const key = `${x},${y}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(segment);
      }
    }
    return (point, radius) => {
      const nearby = new Set();
      const x0 = Math.floor((point[0] - radius) / cellSize), x1 = Math.floor((point[0] + radius) / cellSize);
      const y0 = Math.floor((point[1] - radius) / cellSize), y1 = Math.floor((point[1] + radius) / cellSize);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (const segment of cells.get(`${x},${y}`) || []) nearby.add(segment);
      let best = null;
      // Stable source order preserves the previous attachment when segments tie.
      for (const segment of [...nearby].sort((a, b) => a.order - b.order)) {
        const result = nearestPointOnSegment(point, segment.start, segment.end);
        if (result.distance <= radius && (!best || result.distance < best.distance)) best = result;
      }
      return best;
    };
  }
  function mergeRoutes(roads) {
    const groups = new Map(), routes = [];
    for (const road of roads) {
      if (road.p.length < 2) continue;
      const key = JSON.stringify([road.n || '', road.k, !!road.b]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(road);
    }
    const keyOf = point => `${round(point[0])},${round(point[1])}`;
    for (const group of groups.values()) {
      const edges = [], nodes = new Map(), seen = new Set();
      for (const road of group) {
        const points = road.p.filter((point, index, list) => !index || dist(point, list[index - 1]) > .001);
        if (points.length < 2) continue;
        const forward = points.map(keyOf).join(';'), reverse = [...points].reverse().map(keyOf).join(';');
        const signature = forward < reverse ? forward : reverse;
        if (seen.has(signature)) continue;
        seen.add(signature);
        const edge = {points, start:keyOf(points[0]), end:keyOf(points[points.length - 1]), used:false};
        edges.push(edge);
        for (const key of [edge.start, edge.end]) {
          if (!nodes.has(key)) nodes.set(key, []);
          nodes.get(key).push(edge);
        }
      }
      function walk(first, start) {
        const points = [];
        let edge = first, node = start;
        while (edge && !edge.used) {
          edge.used = true;
          const nextPoints = edge.start === node ? edge.points : [...edge.points].reverse();
          points.push(...(points.length ? nextPoints.slice(1) : nextPoints));
          node = edge.start === node ? edge.end : edge.start;
          const incident = nodes.get(node);
          // Keep real branches separate instead of inventing a route through a junction.
          edge = incident.length === 2 ? incident.find(item => !item.used) : null;
        }
        routes.push({p:points, k:group[0].k, n:group[0].n, b:group[0].b});
      }
      for (const [key, incident] of nodes) if (incident.length !== 2) for (const edge of incident) if (!edge.used) walk(edge, key);
      for (const edge of edges) if (!edge.used) walk(edge, edge.start);
    }
    return routes;
  }
  function branchRoutes(mainRoads, candidateRoads, threshold=16, maxLength=82) {
    const branches=[];
    const nearestMain = segmentIndex(mainRoads);
    for(const road of candidateRoads){
      if(road.p.length<2)continue;
      let attachment=null;
      for(const endpointIndex of [0,road.p.length-1]){
        const nearest=nearestMain(road.p[endpointIndex],threshold);
        if(nearest&&(!attachment||nearest.distance<attachment.distance))attachment={...nearest,endpointIndex};
      }
      if(!attachment||attachment.distance>threshold)continue;
      const branch=branchPathFromEndpoint(road.p,attachment.endpointIndex,maxLength);
      branches.push([attachment.point,...branch]);
    }
    return branches;
  }
  function networkModel() {
    const data = window.CITY_DATA;
    let model = networkModels.get(data);
    if (!model || model.source !== data.roads || model.networkSource !== data.network) {
      const mainRoads = data.roads.filter(road => ['primary','secondary','tertiary'].includes(road.k));
      const branchRoads = data.roads.filter(road => ['residential','unclassified','living_street','service'].includes(road.k));
      model = {source:data.roads, networkSource:data.network, mainRoads, mains:data.network?.routes||mergeRoutes(mainRoads), branches:data.network?(data.network.branches||[]):branchRoutes(mainRoads,branchRoads,18,82), events:new WeakMap(), branchViews:new Map()};
      networkModels.set(data, model);
    }
    return model;
  }
  function eventNetwork(event, roads) {
    let mainRoad=null,location=null;
    for(const road of roads){
      const nearest=nearestPolylinePoint(event.point,road.p);
      if(!location||nearest.distance<location.distance){mainRoad=road;location=nearest;}
    }
    if(!mainRoad||!location)return {main:[],branches:[]};
    const main=slicePolylineAround(mainRoad.p,location,48);
    const candidates=roads.filter(road=>road!==mainRoad&&!['primary','secondary','tertiary','footway','pedestrian'].includes(road.k));
    const branches=[];
    for(const road of candidates){
      if(road.p.length<2)continue;
      let attachment=null;
      for(const endpointIndex of [0,road.p.length-1]){
        const nearest=nearestPolylinePoint(road.p[endpointIndex],main);
        if(!attachment||nearest.distance<attachment.distance)attachment={...nearest,endpointIndex,distance:nearest.distance};
      }
      if(!attachment||attachment.distance>19)continue;
      branches.push([attachment.point,...branchPathFromEndpoint(road.p,attachment.endpointIndex,52)]);
    }
    return {main,branches};
  }
  function geographicPoint(lon, lat) {
    const d = window.CITY_DATA, b = d.bounds;
    const merc=y=>Math.log(Math.tan(Math.PI/4+y*Math.PI/360));
    const y=d.mercator?(merc(b[3])-merc(lat))/(merc(b[3])-merc(b[1])):(b[3]-lat)/(b[3]-b[1]);
    return [(lon - b[0]) / (b[2] - b[0]) * d.w, y*d.h];
  }
  function nearestUtilityPoint(name,point) {
    const routes=networkModel().mains.filter(route=>!name||route.n===name);
    let best=null;
    for(const route of routes){const candidate=nearestPolylinePoint(point,route.p);if(!best||candidate.distance<best.distance)best=candidate;}
    return best?[...best.point]:nearestRoadPoint(name,point);
  }
  function pipePieces(events) {
    const model=networkModel();
    const under=events.filter(event=>event.layer==='under');
    const signature=under.map(event=>[event.id,event.point[0],event.point[1]].join(':')).join('|');
    let cached=paintedNetworks.get(model);
    if(cached?.signature===signature)return cached.pieces;
    const assignments=new Map();
    for(const event of under){
      let best=null;
      for(let index=0;index<model.mains.length;index++){
        const nearest=nearestPolylinePoint(event.point,model.mains[index].p);
        if(!best||nearest.distance<best.distance)best={...nearest,index};
      }
      if(!best)continue;
      if(!assignments.has(best.index))assignments.set(best.index,[]);
      assignments.get(best.index).push({event,location:best});
    }
    const pieces=[];
    for(const [index,route] of model.mains.entries()){
      const cumulative=[0];
      for(let i=1;i<route.p.length;i++)cumulative.push(cumulative[i-1]+dist(route.p[i-1],route.p[i]));
      const length=cumulative.at(-1),cuts=new Set([0,length]),intervals=[];
      for(const item of assignments.get(index)||[]){
        const position=cumulative[item.location.segmentIndex]+dist(route.p[item.location.segmentIndex],item.location.point);
        const start=Math.max(0,position-31),end=Math.min(length,position+31);
        cuts.add(start);cuts.add(end);intervals.push({start,end,id:item.event.id});
      }
      const sorted=[...cuts].sort((a,b)=>a-b);
      for(let i=1;i<sorted.length;i++){
        const start=sorted[i-1],end=sorted[i];if(end-start<.001)continue;
        const points=[pointAtDistance(route.p,cumulative,start)];
        for(let j=1;j<route.p.length-1;j++)if(cumulative[j]>start&&cumulative[j]<end)points.push(route.p[j]);
        points.push(pointAtDistance(route.p,cumulative,end));
        const owner=intervals.find(item=>(start+end)/2>=item.start&&(start+end)/2<=item.end);
        pieces.push({route:index,p:points,eventId:owner?.id});
      }
    }
    const branches=(window.CITY_DATA.network?.branches||[]).map(branch=>{
      if(!branch.root)return {...branch,eventId:null};
      const owner=pieces.find(piece=>piece.eventId&&nearestPolylinePoint(branch.root,piece.p).distance<.04);
      return {...branch,eventId:owner?.eventId};
    });
    const houses=(window.CITY_DATA.network?.houseConnections||[]).flatMap(connection=>{
      if(!connection.root)return [];
      const owner=pieces.find(piece=>piece.eventId&&nearestPolylinePoint(connection.root,piece.p).distance<.04);
      return owner?[{building:connection.building,eventId:owner.eventId}]:[];
    });
    paintedNetworks.set(model,{signature,pieces,branches,houses});
    return pieces;
  }
  function pipesMarkup(opt,events) {
    const byId=new Map(events.map(event=>[event.id,event]));
    let result='<g class="city-pipes" clip-path="url(#city-pipe-clip)" fill="none" stroke-linecap="butt" stroke-linejoin="round" pointer-events="none">';
    for(const [index,piece] of pipePieces(events).entries()){
      const event=byId.get(piece.eventId),color=event?statusColor(eventColorCategory(event)):palette.pipe;
      result+=`<path data-pipe-route="${piece.route}" data-pipe-piece="${index}"${event?` data-highlight-event="${esc(event.id)}"`:''} d="${path(piece.p,-12,opt)}" stroke="${color}" stroke-width="5.2"/>`;
    }
    if(window.CITY_DATA.network?.branches?.length){
      const model=networkModel(),painted=paintedNetworks.get(model),view=!!opt.flat;
      const signature=painted.signature+':'+view;
      if(!model.branchViews.has(signature)){
        const batches=new Map();
        for(const branch of painted.branches){
          const key=branch.eventId||'';
          if(!batches.has(key))batches.set(key,[]);
          batches.get(key).push(path(branch.p,-12,opt));
        }
        model.branchViews.clear();
        model.branchViews.set(signature,[...batches].map(([eventId,lines])=>({eventId,line:lines.join('')})));
      }
      for(const batch of model.branchViews.get(signature)){
        const event=byId.get(batch.eventId),color=event?statusColor(eventColorCategory(event)):palette.branch;
        result+=`<path class="pipe-house-branches"${event?` data-highlight-event="${esc(event.id)}"`:''} d="${batch.line}" stroke="${color}" stroke-width="1.8"/>`;
      }
    }
    return result+'</g>';
  }
  function eventColorCategory(event) {
    if (event.status === 'planned') return 'outage';
    if (event.status === 'work') return 'active';
    if (event.status === 'done') return 'confirmed';
    return 'unknown';
  }
  function statusColor(category) {
    return category==='outage'?'#c94343':category==='active'?'#d8a31c':category==='confirmed'?'#27834e':'#267ee8';
  }
  function eventNetworkMarkup(event, opt) {
    // Lower-level status is painted into the pipeline itself, never laid over it.
    if(window.CITY_DATA.network&&event.layer==='under')return '';
    const roads=window.CITY_DATA.roads.filter(road=>!event.roadName||road.n===event.roadName);
    let best=null;
    for(const road of roads){const location=nearestPolylinePoint(event.point,road.p);if(!best||location.distance<best.location.distance)best={road,location};}
    if(!best)return '';
    const category=eventColorCategory(event),color=statusColor(category);
    const points=slicePolylineAround(best.road.p,best.location,48);
    return `<g class="event-highlight event-highlight-${event.layer} status-${category}" data-highlight-event="${esc(event.id)}" data-road-kind="${best.road.k}" fill="none" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"><path d="${path(points,best.road.b?2:1,opt)}" stroke="${color}" stroke-width="${ROAD_WIDTHS[best.road.k]||2}"/></g>`;
  }
  function wallsPath(points,bottom,top,opt){
    if(opt.flat)return '';
    let result='';
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],ap=project(a,bottom,opt),bp=project(b,bottom,opt);
      if(bp[0]>=ap[0])continue;
      result+=`M${ap.join(',')}L${bp.join(',')}L${project(b,top,opt).join(',')}L${project(a,top,opt).join(',')}Z`;
    }
    return result;
  }

  function marker(event, opt, selected) {
    const roof = event.layer === 'above' ? (event.icon==='light'?11:(nearestBuilding(event.point)?.h || 18) * .85 + 4) : event.layer === 'under' ? -16 : 2;
    const [x, y] = project(event.point, roof, opt);
    const colorCategory = eventColorCategory(event);
    return `<g class="city-marker status-${colorCategory} ${selected ? 'selected' : ''}" data-event-id="${esc(event.id)}" data-marker-layer="${esc(event.layer)}" transform="translate(${x},${y})" role="button" tabindex="0" aria-label="${esc(event.title + '. ' + event.address)}"><title>${esc(event.title + ' · ' + event.address)}</title>
      <g class="fixed-map-symbol">
      <rect x="-20" y="-43" width="40" height="44" fill="transparent"/>
      <path class="marker-disc" d="M0,0C-4,-8 -16,-13 -16,-24A16,16 0 1 1 16,-24C16,-13 4,-8 0,0Z" fill="var(--marker-color, #2376eb)" stroke="#fff" stroke-width="1.8"/>
      <use href="#i-${event.icon || 'tap'}" x="-9" y="-33" width="18" height="18" color="#fff" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>

      </g>
    </g>`;
  }

  function drawScene(opt = {}, events = [], selectedId = '') {
    const d = window.CITY_DATA;
    const topology = networkModel(), mainRoads = topology.mainRoads;
    let scene = sceneModels.get(d);
    if (!scene || scene.roads !== d.roads || scene.buildings !== d.buildings || scene.parks !== d.parks || scene.water !== d.water) {
      scene = {roads:d.roads, buildings:d.buildings, parks:d.parks, water:d.water, views:new Map()};
      sceneModels.set(d, scene);
    }
    const view = !!opt.flat;
    let out = scene.views.get(view);
    if (out === undefined) {
    const corners = [[0,0],[d.w,0],[d.w,d.h],[0,d.h]];
    out = '<g id="mapWorld">';
    if(d.cityBoundary)out+=`<defs><clipPath id="city-road-clip"><path d="${path(d.cityBoundary,1,opt,true)}"/></clipPath><clipPath id="city-pipe-clip"><path d="${path(d.networkBoundary||d.cityBoundary,-12,opt,true)}"/></clipPath></defs>`;
    if(d.island&&!opt.flat){
      const area=d.island.reduce((sum,p,i)=>{const q=d.island[(i+1)%d.island.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
      const boundary=area<0?[...d.island].reverse():d.island;
      out+=`<g class="city-island-sides" pointer-events="none"><path d="${wallsPath(boundary,-32,-7,opt)}" fill="${palette.slab}"/><path d="${wallsPath(boundary,-7,0,opt)}" fill="${palette.slabEdge}"/></g>`;
    }
    out+='<g class="city-island" pointer-events="none"><g class="city-forest-fringe">';
    for(const band of d.coast||[])out+=`<path d="${path(band.p,0,opt,true)}" fill="${palette.forest}" opacity="${band.opacity}"/>`;
    if(d.island)out+=`<path d="${path(d.island,0,opt,true)}" fill="${palette.forest}"/>`;
    out+='</g>';
    if(d.island)out+=`<path class="city-under-base" d="${path(d.island,0,opt,true)}" fill="${palette.land}"/>`;
    out+=`<path d="${path(d.urbanBoundary||d.district,0,opt,true)}" fill="${palette.land}"/>`;
    out+='</g>';
    out+=`<g class="city-land"><path d="${path(d.urbanBoundary||d.district||corners,0,opt,true)}" fill="${palette.land}" fill-opacity=".91"/>`;
    for(const park of d.parks) out+=`<path d="${path(park,.2,opt,true)}" fill="${palette.park}" stroke="${palette.parkEdge}" stroke-width=".6"/>`;
    out+='</g>';
    out+='<g class="city-forest" pointer-events="none">';
    for(const forest of d.forestAreas||[])out+=`<path d="${path(forest,.3,opt,true)}" fill="${palette.forest}"/>`;
    out+='</g>';
    out+='<g class="city-water">';
    for(const water of d.water) out+=`<path d="${path(water.p,.3,opt,true)}" fill="${palette.water}" stroke="${palette.waterEdge}" stroke-width="1"/>`;
    out+='</g>';
    out+='<!--city-network-->';
    out+='<g class="city-roads" clip-path="url(#city-road-clip)" fill="none" stroke-linecap="round" stroke-linejoin="round" pointer-events="none">';
    const widths=ROAD_WIDTHS;
    const roadBatches = new Map();
    for(const r of d.roads){
      const width=widths[r.k]||2, color=r.k==='footway'||r.k==='pedestrian'?palette.path:palette.road, key=`${width}:${color}`;
      if(!roadBatches.has(key))roadBatches.set(key,{width,color,lines:[]});
      for(const points of r.visibleP||[r.p])roadBatches.get(key).lines.push(path(points,r.b?2:1,opt));
    }
    // Equal-style road segments share a path; data.roads remains intact for search and events.
    for(const batch of roadBatches.values()){
      const line=batch.lines.join('');if(!line)continue;
      out+=`<path d="${line}" stroke="${batch.color}" stroke-width="${batch.width}"/>`;
    }
    out+='</g>';
    out+='<g class="city-active-roads" clip-path="url(#city-road-clip)" fill="none" stroke-linecap="round" stroke-linejoin="round" pointer-events="none">';
    for(const kind of ['primary','secondary','tertiary']) {
      const width=widths[kind],line=mainRoads.filter(r=>r.k===kind).flatMap(r=>(r.visibleP||[r.p]).map(points=>path(points,r.b?2:1,opt))).join('');
      if(line)out+=`<path d="${line}" stroke="${palette.activeRoad}" stroke-width="${width}"/>`;
    }
    out+='</g>';
    const sorted=d.buildings.map(building=>({building,depth:project(buildingModel(building).point,0,opt)[1]})).sort((a,b)=>a.depth-b.depth).map(item=>item.building);
    out+='<g class="city-buildings" stroke-linejoin="round" pointer-events="none">';
    for(const b of sorted){
      const z=b.h*.85, p=buildingModel(b).points;
      const service=['industrial','warehouse','garages','garage','service'].includes(b.kind);
      const walls=wallsPath(p,0,z,opt);
      if(walls)out+=`<path class="building-body" data-building-wall="${b.id}" d="${walls}" fill="${service?palette.serviceWall:palette.wall}"/>`;
      out+=`<path data-building="${b.id}" d="${path(p,z,opt,true)}" fill="${service?palette.serviceRoof:palette.roof}" stroke="${palette.roofEdge}" stroke-opacity=".45" stroke-width=".45"/>`;
    }
    out+='</g>';
    scene.views.set(view,out);
    }
    out=out.replace('<!--city-network-->',pipesMarkup(opt,events));
    const affected=new Map(paintedNetworks.get(topology).houses.map(house=>[String(house.building),house.eventId]));
    const byId=new Map(events.map(event=>[event.id,event]));
    // Change only the under-layer fill. Original paths, depth order and opacity
    // are shared, so affected buildings are never painted twice.
    out=out.replace(/<path\b[^>]*\bdata-building(?:-wall)?="([^"]+)"[^>]*>/g,(tag,id)=>{
      const event=byId.get(affected.get(id));if(!event)return tag;
      const color=statusColor(eventColorCategory(event));
      tag=tag.includes('class="')?tag.replace(/class="([^"]*)"/,'class="$1 network-affected"'):tag.replace('<path','<path class="network-affected"');
      return tag.replace('<path',`<path data-affected-event="${esc(event.id)}" style="--affected-color:${color}"`);
    });
    out+='<g class="city-lights">';
    const lightEvents=events.filter(event=>event.layer==='above'&&event.icon==='light');
    const lightPoints=lightEvents.map(event=>event.point);
    for(const road of d.streetLabels||[]){
      if(!['проспект Максима Горького','улица Гузовского','улица Эльгера'].includes(road.t))continue;
      const cumulative=[0];for(let i=1;i<road.p.length;i++)cumulative.push(cumulative[i-1]+dist(road.p[i-1],road.p[i]));
      for(let at=35;at<cumulative.at(-1);at+=88){const p=pointAtDistance(road.p,cumulative,at);if(!lightPoints.some(q=>dist(p,q)<24))lightPoints.push(p);}
    }
    for(const p of lightPoints){
      const [x,y]=project([p[0],p[1]+3],0,opt);
      const related=lightEvents.reduce((best,event)=>!best||dist(event.point,p)<dist(best.point,p)?event:best,null);
      const active=related&&dist(related.point,p)<24,color=active?statusColor(eventColorCategory(related)):palette.light;
      if(opt.flat)out+=`<circle class="city-lamp-dot" cx="${x}" cy="${y}" r="${active?2.2:1.5}" fill="${color}"/>`;
      else out+=`<path class="city-lamp-pole" d="M${x},${y}v-11h3.5" fill="none" stroke="${color}" stroke-width="${active?1.4:.7}"/><ellipse cx="${x+3.5}" cy="${y-11}" rx="${active?2:1.4}" ry="${active?1.5:.7}" fill="${color}"/>`;
    }
    out+='</g>';
    out+='<g class="event-object-highlights-above" pointer-events="none">';
    for(const event of events.filter(item=>item.layer==='above'&&item.icon!=='light')){
      const object=nearestBuilding(event.point);if(!object)continue;
      const color=statusColor(eventColorCategory(event)),height=object.h*.85;
      const points=buildingModel(object).points;
      out+=`<g class="event-object-highlight status-${eventColorCategory(event)}" data-highlight-event="${esc(event.id)}" fill="${color}" opacity=".85">`;
      const walls=wallsPath(points,0,height,opt);
      if(walls)out+=`<path class="event-building-walls" d="${walls}"/>`;
      out+=`<path class="event-building-roof" d="${path(points,height,opt,true)}" stroke="${color}" stroke-width=".5"/></g>`;
    }
    out+='</g>';
    let labelMarkup='<g class="city-labels" font-family="Manrope, sans-serif">';
    for(const label of d.streetLabels||[]){
      const points=project(label.p[0],0,opt)[0]>project(label.p.at(-1),0,opt)[0]?[...label.p].reverse():label.p;
      labelMarkup+=`<defs><path id="${esc(label.id)}" d="${path(points,1,opt)}"/></defs><text dy="-3" fill="${palette.label}" font-size="${round(label.size*.7)}" font-weight="500" letter-spacing=".15" text-anchor="middle" stroke="${palette.land}" stroke-width=".65" stroke-opacity=".9" paint-order="stroke"><textPath href="#${esc(label.id)}" startOffset="50%">${esc(label.t)}</textPath></text>`;
    }
    for(const label of d.areaLabels||[]){const [x,y]=project(label.p,1,opt);labelMarkup+=`<text class="city-area-label" x="${x}" y="${y}" fill="${palette.label}" font-size="${round(label.size*.7)}" font-weight="500" text-anchor="middle" stroke="${palette.land}" stroke-width=".8" stroke-opacity=".7" paint-order="stroke">${esc(label.t)}</text>`;}
    labelMarkup+='</g>';
    out+='<g id="homeRadius"></g>';
    out+='<g id="eventHighlights">'+events.filter(event=>event.layer==='ground'||event.layer==='under').map(event=>eventNetworkMarkup(event,opt)).join('')+'</g>';
    out+='<g id="cityMarkers">'+events.map(e=>marker(e,opt,e.id===selectedId)).join('')+'</g>';
    return out+labelMarkup+'</g>';
  }

  class CityMap {
    constructor(svg, viewport, events, select) {
      this.svg=svg;this.viewport=viewport;this.events=events;this.select=select;this.layer='above';this.selected='a1';
      this.minZoom=.68;this.maxZoom=16;this.zoom=1;this.pan=[0,0];this.flat=false;this.home=null;this.drag=null;this.didDrag=false;this.transformFrame=null;this.zoomEventPending=false;
      this.render();this.bind();
    }
    options(){return {flat:this.flat};}
    render(){
      this.svg.innerHTML='<title>Чебоксары — остров с лесом и тремя уровнями городских событий</title>'+drawScene(this.options(),this.events,this.selected);
      this.markerNodes=Array.from(this.svg.querySelectorAll('[data-event-id]'));
      this.eventsById=new Map(this.events.map(event=>[event.id,event]));
      this.markerShapes=this.markerNodes.map(node=>node.querySelector('.fixed-map-symbol'));
      this.markerScale=null;
      this.world=this.svg.querySelector('#mapWorld');this.setTransform();this.updateMarkers();this.updateHome();
    }
    setTransform(){
      if(this.world)this.world.setAttribute('transform',`translate(${this.pan[0]},${this.pan[1]}) translate(600,438) scale(${this.zoom}) translate(-600,-438)`);
      this.updateMarkerScale();
      window.dispatchEvent(new CustomEvent('mapmove'));
    }
    updateMarkerScale(){
      const matrix=this.svg.getScreenCTM?.();
      const rect=matrix?null:this.svg.getBoundingClientRect();
      const measuredScale=matrix?Math.hypot(matrix.a,matrix.b):Math.min(rect.width/W,rect.height/H);
      const screenScale=measuredScale>0?measuredScale:1;
      const inverse=uiScale()/(this.zoom*screenScale);
      if(this.markerScale===inverse)return;
      this.markerScale=inverse;
      for(const shape of [...(this.markerShapes||[]),this.homeSymbol])if(shape)shape.setAttribute('transform',`scale(${inverse})`);
    }
    markerScreenPoint(id){
      const node=this.markerNodes.find(marker=>marker.dataset.eventId===id);if(!node)return null;
      const matrix=node.getScreenCTM?.();
      if(matrix&&Number.isFinite(matrix.e)&&Number.isFinite(matrix.f))return {x:matrix.e,y:matrix.f-24*uiScale()};
      const match=node.getAttribute('transform').match(/translate\(([^,]+),([^)]+)\)/);if(!match)return null;
      const rect=this.svg.getBoundingClientRect(),scale=Math.min(rect.width/W,rect.height/H)||1;
      return {x:rect.left+(rect.width-W*scale)/2+(this.pan[0]+600+(Number(match[1])-600)*this.zoom)*scale,
        y:rect.top+(rect.height-H*scale)/2+(this.pan[1]+438+(Number(match[2])-438)*this.zoom)*scale-24*uiScale()};
    }
    flushTransform(){
      this.setTransform();
      if(this.zoomEventPending){this.zoomEventPending=false;window.dispatchEvent(new CustomEvent('mapzoom'));}
    }
    queueTransform(){
      if(this.transformFrame!==null)return;
      this.transformFrame=window.requestAnimationFrame(()=>{this.transformFrame=null;this.flushTransform();});
    }
    setLayer(layer){this.layer=layer;this.updateMarkers();}
    updateMarkers(){
      for(const node of this.markerNodes){
        const show=node.dataset.markerLayer===this.layer;
        node.style.display=show?'':'none';node.setAttribute('aria-hidden',String(!show));node.setAttribute('tabindex',show?'0':'-1');
        node.classList.toggle('selected',node.dataset.eventId===this.selected);
      }
    }
    setSelected(id){this.selected=id;this.updateMarkers();}
    setFilter(type){for(const node of this.markerNodes){const e=this.eventsById.get(node.dataset.eventId);const show=e.layer===this.layer&&(type==='all'||e.type===type);node.style.display=show?'':'none';node.setAttribute('aria-hidden',String(!show));node.setAttribute('tabindex',show?'0':'-1');}}
    changeZoom(factor,anchor=[600,438]){
      const previous=this.zoom;
      this.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.zoom*factor));
      const ratio=this.zoom/previous;
      this.pan=[anchor[0]-600-(anchor[0]-600-this.pan[0])*ratio,anchor[1]-438-(anchor[1]-438-this.pan[1])*ratio];
      this.setTransform();return this.zoom;
    }
    reset(){this.zoom=1;this.pan=[0,0];this.setTransform();}
    focus(p){const [x,y]=project(p,0,this.options());this.pan=[(600-x)*this.zoom,(465-y)*this.zoom];this.setTransform();}
    toggleView(){this.flat=!this.flat;this.render();return this.flat;}
    setHome(home){this.home=home;this.updateHome();}
    updateHome(){
      const root=this.svg.querySelector('#homeRadius');if(!root)return;
      if(!this.home?.point){root.innerHTML='';this.homeSymbol=null;return;}
      const d=window.CITY_DATA,b=d.bounds,mpp=(b[2]-b[0])*111320*Math.cos(56.15*Math.PI/180)/d.w;
      const radius=this.home.radius/mpp,p=this.home.point,circle=Array.from({length:65},(_,i)=>[p[0]+Math.cos(i*Math.PI/32)*radius,p[1]+Math.sin(i*Math.PI/32)*radius]);
      const [x,y]=project(p,2,this.options());
      root.innerHTML=`<path d="${path(circle,2,this.options(),true)}" fill="#86bcff" fill-opacity=".09" stroke="#76a9e9" stroke-opacity=".7" stroke-width="1.4" stroke-dasharray="5 5"/><g transform="translate(${x},${y})"><g class="fixed-home-symbol"><circle r="13" fill="#fff" stroke="#4a94ed" stroke-width="1.6"/><use href="#i-home" x="-7" y="-7" width="14" height="14" fill="none" stroke="#3988e7" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></g></g>`;
      this.homeSymbol=root.querySelector('.fixed-home-symbol');this.markerScale=null;this.updateMarkerScale();
    }
    svgPoint(event){const p=this.svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform(this.svg.getScreenCTM().inverse());}
    bind(){
      if(window.ResizeObserver){this.resizeObserver=new window.ResizeObserver(()=>this.updateMarkerScale());this.resizeObserver.observe(this.svg);}
      else window.addEventListener('resize',()=>this.updateMarkerScale());
      const pointers=new Map();let pinch=null;
      const startGesture=()=>{
        const active=[...pointers.entries()];this.drag=null;pinch=null;
        if(active.length>=2){
          const [[aId,a],[bId,b]]=active;
          pinch={ids:[aId,bId],distance:Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)),center:[(a.x+b.x)/2,(a.y+b.y)/2],zoom:this.zoom,pan:[...this.pan]};
          this.didDrag=true;this.viewport.classList.add('dragging');
          for(const id of pinch.ids)this.viewport.setPointerCapture(id);
        }else if(active.length===1){
          const [id,p]=active[0];this.drag={id,start:[p.x,p.y],pan:[...this.pan]};
        }else this.viewport.classList.remove('dragging');
      };
      this.viewport.addEventListener('pointerdown',e=>{
        const marker=e.target.closest('[data-event-id]');
        if(e.button!==0||(marker&&e.pointerType!=='touch'))return;
        pointers.set(e.pointerId,this.svgPoint(e));
        if(pointers.size===1)this.didDrag=false;
        // A single tap on a marker keeps its original click target.
        if(!marker)this.viewport.setPointerCapture(e.pointerId);
        startGesture();
      });
      this.viewport.addEventListener('pointermove',e=>{
        if(!pointers.has(e.pointerId))return;
        const p=this.svgPoint(e);pointers.set(e.pointerId,p);
        if(pinch){
          if(!pinch.ids.includes(e.pointerId))return;
          const [a,b]=pinch.ids.map(id=>pointers.get(id));
          const center=[(a.x+b.x)/2,(a.y+b.y)/2];
          const zoom=Math.max(this.minZoom,Math.min(this.maxZoom,pinch.zoom*Math.hypot(b.x-a.x,b.y-a.y)/pinch.distance));
          const ratio=zoom/pinch.zoom;
          this.zoomEventPending=this.zoomEventPending||zoom!==this.zoom;this.zoom=zoom;
          this.pan=[center[0]-600-(pinch.center[0]-600-pinch.pan[0])*ratio,center[1]-438-(pinch.center[1]-438-pinch.pan[1])*ratio];
        }else if(this.drag&&e.pointerId===this.drag.id){
          const dx=p.x-this.drag.start[0],dy=p.y-this.drag.start[1];
          if(Math.hypot(dx,dy)>3){this.didDrag=true;this.viewport.classList.add('dragging');}
          this.pan=[this.drag.pan[0]+dx,this.drag.pan[1]+dy];
        }else return;
        this.queueTransform();
      });
      const end=e=>{
        if(!pointers.delete(e.pointerId))return;
        if(this.transformFrame!==null){window.cancelAnimationFrame(this.transformFrame);this.transformFrame=null;this.flushTransform();}
        startGesture();
      };
      this.viewport.addEventListener('pointerup',end);this.viewport.addEventListener('pointercancel',end);
      this.viewport.addEventListener('lostpointercapture',e=>{if(e.target===this.viewport)end(e);});
      this.svg.addEventListener('click',e=>{if(pointers.size)return;const node=e.target.closest('[data-event-id]');if(!this.didDrag){if(node)this.select(node.dataset.eventId);else window.dispatchEvent(new CustomEvent('mapbackground'));}this.didDrag=false;});
      this.svg.addEventListener('keydown',e=>{const node=e.target.closest('[data-event-id]');if(node&&(e.key==='Enter'||e.key===' ')){e.preventDefault();this.select(node.dataset.eventId);}});
      this.viewport.addEventListener('wheel',e=>{e.preventDefault();const point=this.svgPoint(e);this.changeZoom(e.deltaY<0?1.12:1/1.12,[point.x,point.y]);window.dispatchEvent(new CustomEvent('mapzoom'));},{passive:false});
      this.viewport.addEventListener('keydown',e=>{if(e.target.closest('[data-event-id]'))return;const actions={ArrowLeft:[30,0],ArrowRight:[-30,0],ArrowUp:[0,30],ArrowDown:[0,-30]};if(actions[e.key]){e.preventDefault();this.pan[0]+=actions[e.key][0];this.pan[1]+=actions[e.key][1];this.setTransform();}else if(e.key==='+'||e.key==='='){e.preventDefault();this.changeZoom(1.2);window.dispatchEvent(new CustomEvent('mapzoom'));}else if(e.key==='-'){e.preventDefault();this.changeZoom(1/1.2);window.dispatchEvent(new CustomEvent('mapzoom'));}});
    }
  }
  window.GorodMapRenderer={drawScene,project,nearestRoadPoint,nearestUtilityPoint,nearestBuilding,geographicPoint,center,dist,eventColorCategory};
  window.CityMap=CityMap;
})();
