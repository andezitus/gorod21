const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const root = path.resolve(__dirname, '..');
function load() {
  const context = {window:{}, document:{getElementById(){return null;}}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'city-data.js'), 'utf8'), context);
  const source = fs.readFileSync(path.join(root, 'map.js'), 'utf8');
  vm.runInContext(source.replace('window.CityMap=CityMap;', 'window.CityMap=CityMap; window.testGeometry={mergeRoutes,branchRoutes,networkModel,eventNetwork,buildingModel,pipePieces,paintedNetworks};'), context);
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  vm.runInContext(app.slice(0, app.indexOf('  const statusText')) + 'window.testEvents=events;})();', context);
  return {context, renderer:context.window.GorodMapRenderer, geometry:context.window.testGeometry, events:context.window.testEvents, data:context.window.CITY_DATA};
}
const group = (svg, name) => (svg.match(new RegExp('<g class="' + name + '"[^>]*>([\\s\\S]*?)<\\/g>')) || [])[1] || '';
const paths = svg => svg.match(/<path\b[^>]*>/g) || [];
const attr = (tag, name) => (tag.match(new RegExp('\\b' + name + '="([^"]*)"')) || [])[1];
const plain = object => JSON.parse(JSON.stringify(object));
const pointKey = point => point.map(n => Math.round(n * 100) / 100).join(',');
function segments(roads) {
  const result = new Set();
  for (const road of roads) for (let i = 1; i < road.p.length; i++) {
    const pair = [pointKey(road.p[i - 1]), pointKey(road.p[i])].sort();
    if (pair[0] !== pair[1]) result.add(pair.join(';'));
  }
  return [...result].sort();
}

test('explicit mains preserve source data and partition into non-overlapping colored pieces', () => {
  const {data, geometry,events} = load();
  const before = JSON.stringify(data),model=geometry.networkModel(),pieces=geometry.pipePieces(events);
  assert.equal(model.mains,data.network.routes);
  const length=points=>points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);
  for(const [index,route] of model.mains.entries()){
    const parts=pieces.filter(piece=>piece.route===index);
    assert(parts.length>0);
    assert(Math.abs(parts.reduce((sum,piece)=>sum+length(piece.p),0)-length(route.p))<1e-6);
    assert.deepEqual(plain(parts[0].p[0]),plain(route.p[0]));
    assert.deepEqual(plain(parts.at(-1).p.at(-1)),plain(route.p.at(-1)));
    for(let i=1;i<parts.length;i++)assert.deepEqual(plain(parts[i-1].p.at(-1)),plain(parts[i].p[0]));
  }
  assert.equal(JSON.stringify(data),before);
});

test('route joining supports reversed segments, loops, branches and disconnected streets', () => {
  const {geometry} = load();
  const road = p => ({p, n:'Улица', k:'primary'});
  const joined = geometry.mergeRoutes([road([[0,0],[5,0]]), road([[10,0],[5,0]]), road([[10,0],[15,0]])]);
  assert.equal(joined.length, 1);
  assert.deepEqual(plain(joined[0].p), [[0,0],[5,0],[10,0],[15,0]]);
  const fork = geometry.mergeRoutes([road([[0,0],[5,0]]), road([[5,0],[10,0]]), road([[5,0],[5,5]])]);
  assert.equal(fork.length, 3, 'A junction must not turn into a fabricated through-route');
  const loop = geometry.mergeRoutes([road([[0,0],[5,0]]), road([[5,5],[5,0]]), road([[5,5],[0,0]])]);
  assert.equal(loop.length, 1);
  assert.deepEqual(plain(loop[0].p[0]), plain(loop[0].p.at(-1)));
  assert.equal(geometry.mergeRoutes([road([[0,0],[5,0]]), road([[8,0],[12,0]])]).length, 2);
  assert.equal(geometry.mergeRoutes([road([[0,0],[5,0]]), road([[5,0],[0,0]])]).length, 1);
});

test('branch attachment stays on the nearest main and respects its distance limit', () => {
  const {geometry} = load();
  const main = [{p:[[0,0],[100,0]],k:'primary'}];
  const candidates = [{p:[[25,4],[25,24],[25,50]]},{p:[[10,40],[10,80]]},{p:[[80,40],[80,4]]}];
  const branches = plain(geometry.branchRoutes(main,candidates,5,30));
  assert.equal(branches.length, 2);
  assert.deepEqual(branches[0], [[25,0],[25,4],[25,24],[25,34]]);
  assert.deepEqual(branches[1], [[80,0],[80,4],[80,34]]);
});

test('all district buildings have closed roofs and solid near-facing facades', () => {
  const {data, renderer, events} = load();
  const before = JSON.stringify(data);
  for (const flat of [false, true]) {
    const svg = renderer.drawScene({flat}, events, 'a1');
    const buildings = paths(group(svg, 'city-buildings'));
    const roofs = buildings.filter(tag => attr(tag, 'data-building'));
    const walls = buildings.filter(tag => (attr(tag, 'class')||'').split(' ').includes('building-body'));
    assert.equal(roofs.length, data.buildings.length);
    assert.equal(new Set(roofs.map(tag => attr(tag,'data-building'))).size, data.buildings.length);
    assert(roofs.every(tag => attr(tag,'d').endsWith('Z')));
    assert.equal(walls.length, flat ? 0 : data.buildings.length);
    assert(walls.every(tag => attr(tag,'d').endsWith('Z') && !attr(tag,'stroke')));
    assert.equal(paths(group(svg, 'city-windows')).length, 0);
  }
  assert.equal(JSON.stringify(data), before);
});

test('one stroke per pipe route, with no repeated pipe filters or animated strips', () => {
  const {renderer, geometry, events} = load();
  const svg = renderer.drawScene({}, events, 'u1'), pipes = group(svg, 'city-pipes'), model = geometry.networkModel();
  assert.equal(paths(pipes).length, geometry.pipePieces(events).length+3);
  assert.equal(new Set([...pipes.matchAll(/data-pipe-route="([^"]+)"/g)].map(m=>m[1])).size, model.mains.length);
  assert(!/filter=|pipe-pulse|stroke-dasharray=/.test(pipes));
  assert(!svg.includes('pipeGlow'));
  assert((svg.match(/<[a-z][a-zA-Z]*\b/g)||[]).length < 3000);
});

test('all event markers, colors and object highlights survive cached redraws', () => {
  const {renderer, events} = load();
  for (const flat of [false, true, false]) {
    const svg = renderer.drawScene({flat}, events, 'u2');
    for (const event of events) {
      assert(svg.includes(`data-event-id="${event.id}"`));
      assert(svg.includes(`status-${renderer.eventColorCategory(event)}`));
      if (event.layer !== 'above') assert(svg.includes(`data-highlight-event="${event.id}"`));
    }
    assert(svg.includes('class="city-marker status-active selected" data-event-id="u2"'));
    assert(svg.includes('id="homeRadius"'));
  }
  const event = plain(events[0]);
  const before = renderer.drawScene({}, [event]);
  event.point = [event.point[0] + 85,event.point[1] + 40];
  event.type = 'work';event.status = 'done';
  const after = renderer.drawScene({}, [event]);
  assert.notEqual(before, after);
  assert(after.includes('data-highlight-event="u1"'));
  assert(after.includes('stroke="#27834e"'));
});

test('replacing CITY_DATA does not reuse another city geometry', () => {
  const {context, renderer, data} = load();
  renderer.drawScene();
  context.window.CITY_DATA = {...data, buildings:[data.buildings[0]]};
  const svg = renderer.drawScene();
  assert.equal((svg.match(/data-building=/g)||[]).length, 1);
});

test('geocoding and map public interface remain compatible', () => {
  const {context, renderer, data, events} = load();
  for (const name of ['drawScene','project','nearestRoadPoint','nearestUtilityPoint','nearestBuilding','geographicPoint','center','dist','eventColorCategory']) assert.equal(typeof renderer[name], 'function');
  for (const name of ['setLayer','setSelected','setFilter','changeZoom','reset','focus','toggleView','setHome','updateHome','svgPoint','bind']) assert.equal(typeof context.window.CityMap.prototype[name], 'function');
  const building = renderer.nearestBuilding(events.find(e=>e.id==='a1').point);
  assert(data.buildings.includes(building));
  const point = renderer.geographicPoint(data.bounds[0],data.bounds[3]);
  assert.deepEqual(plain(point), [0,0]);
  assert.deepEqual(plain(renderer.nearestRoadPoint('Неизвестная улица',[12,34])), [12,34]);
});

test('rapid pointer updates share a frame and apply the latest map position', () => {
  const {context} = load();
  const queue = [];
  context.window.requestAnimationFrame = callback => {queue.push(callback);return queue.length;};
  const map = Object.create(context.window.CityMap.prototype);
  map.transformFrame = null;map.pan = [0,0];
  const rendered = [];
  map.setTransform = () => rendered.push([...map.pan]);
  for(let i=1;i<=20;i++){map.pan=[i,-i];map.queueTransform();}
  assert.equal(queue.length,1);
  assert.equal(rendered.length,0);
  queue.shift()();
  assert.deepEqual(rendered,[[20,-20]]);
  assert.equal(map.transformFrame,null);
  map.pan=[25,30];map.queueTransform();queue.shift()();
  assert.deepEqual(rendered,[[20,-20],[25,30]]);
});

test('island, soft forest boundary and all supplied street names survive 2D and 3D', () => {
  const {renderer,data,events}=load();
  assert(data.buildings.length>200);
  assert(data.coast.length>=5&&data.trees.flat().length===0);
  for(const flat of [false,true]){
    const svg=renderer.drawScene({flat},events);
    assert(svg.includes('class="city-island"'));
    assert(svg.includes('class="city-forest"'));
    assert.equal(svg.includes('class="city-island-sides"'),!flat);
    assert(!svg.includes('Северо-Западный'));
    assert(!/<filter\b|filter=|<animate\b|city-grid|cityShadow|pipe-pulse/.test(svg));
    for(const label of data.streetLabels){assert(svg.includes(label.t));assert(svg.includes('id="'+label.id+'"'));}
    assert(!svg.includes('Чебоксарский залив'));
    assert(!svg.includes('В О Л Г А'));
  }
});


test('six requested scenarios use status colors independently of event type', () => {
  const {events,renderer}=load();
  assert.deepEqual(plain(events.map(e=>e.title)).sort(),['Отключение воды','Ремонт теплосети','Ремонт освещения','Ремонт дороги','Граффити на фасаде здания','Оледенение дороги'].sort());
  for(const type of ['report','work','outage'])for(const [status,color] of [['planned','outage'],['work','active'],['done','confirmed']])assert.equal(renderer.eventColorCategory({type,status}),color);
});

test('above-ground color includes walls, lamps halve in 3D and become dots in 2D',()=>{
  const {renderer,events}=load();
  const three=renderer.drawScene({flat:false},events),two=renderer.drawScene({flat:true},events);
  assert(three.includes('class="event-building-walls"'));assert(three.includes('class="event-building-roof"'));
  assert(!two.includes('class="event-building-walls"'));assert(two.includes('class="event-building-roof"'));
  assert(three.includes('v-11h3.5'));assert(!three.includes('v-22h7'));
  assert(two.includes('class="city-lamp-dot"'));assert(!two.includes('class="city-lamp-pole"'));
  const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
  for(const match of css.matchAll(/\.city-buildings\{opacity:([^}]+)\}/g))assert.equal(match[1],'.75');
});

test('road status strokes match the source carriageway width',()=>{
  const {renderer,events}=load();const svg=renderer.drawScene({},events);
  for(const event of events.filter(e=>e.layer==='ground')){
    const highlight=svg.match(new RegExp('<g class="event-highlight[^>]*data-highlight-event="'+event.id+'"[^>]*>([\\s\\S]*?)</g>'));
    assert(highlight);const kind=attr(highlight[0],'data-road-kind');
    const widths={primary:7,secondary:5.4,tertiary:4,residential:2.6,unclassified:2.6,living_street:2.1,pedestrian:1.3,service:1.1,footway:.6};
    assert.equal(Number(attr(paths(highlight[1])[0],'stroke-width')),widths[kind]);
  }
});


test('branch trees inherit only their main attachment scenario, including downstream edges',()=>{
  const {context,renderer,geometry,data,events}=load();
  const scene=renderer.drawScene({},events);
  const colored=geometry.paintedNetworks.get(geometry.networkModel()).branches;
  for(const id of ['u1','u2']){
    const branches=colored.filter(branch=>branch.eventId===id);assert(branches.length>0,id);
    const tag=paths(group(scene,'city-pipes')).find(tag=>attr(tag,'class')==='pipe-house-branches'&&attr(tag,'data-highlight-event')===id);assert(tag,id);
    assert.equal(attr(tag,'stroke'),id==='u1'?'#c94343':'#d8a31c');
  }
  context.window.CITY_DATA={...data,network:{routes:[{p:[[0,0],[200,0]],n:'Test'}],branches:[
    {p:[[100,0],[100,20]],root:[100,0]},
    {p:[[100,20],[100,40]],root:[100,0]},
    {p:[[20,0],[100,19]],root:[20,0]}
  ]}};
  const event={id:'test',point:[100,0],layer:'under',status:'planned'};
  geometry.pipePieces([event]);
  assert.deepEqual(plain(geometry.paintedNetworks.get(geometry.networkModel()).branches.map(branch=>branch.eventId||null)),['test','test',null]);
  event.point=[20,0];geometry.pipePieces([event]);
  assert.deepEqual(plain(geometry.paintedNetworks.get(geometry.networkModel()).branches.map(branch=>branch.eventId||null)),[null,null,'test']);
});

test('markers stay the same screen size through zoom and responsive SVG resizing',()=>{
  const {context}=load();const map=Object.create(context.window.CityMap.prototype);
  const scales=[];const symbol={setAttribute(name,value){if(name==='transform')scales.push(Number(value.match(/scale\(([^)]+)/)[1]));}};
  map.markerShapes=[symbol];map.homeSymbol=symbol;
  for(const screenScale of [.4,.8,1.2])for(const zoom of [.68,1,4,16]){
    map.svg={getScreenCTM:()=>({a:screenScale,b:0})};map.zoom=zoom;map.markerScale=null;map.updateMarkerScale();
    assert(Math.abs(zoom*screenScale*scales.at(-1)-1)<1e-10);
  }
});

test('zoom reaches house scale and preserves the point under the pointer',()=>{
  const {context}=load();const map=Object.create(context.window.CityMap.prototype);
  map.zoom=2;map.pan=[100,-70];map.minZoom=.68;map.maxZoom=16;map.setTransform=()=>{};
  const anchor=[820,340],before=anchor.map((n,i)=>(n-[600,438][i]-map.pan[i])/map.zoom);
  map.changeZoom(3,anchor);
  const after=anchor.map((n,i)=>(n-[600,438][i]-map.pan[i])/map.zoom);
  assert.deepEqual(plain(after),plain(before));assert.equal(map.zoom,6);
  map.changeZoom(100);assert.equal(map.zoom,16);
  map.changeZoom(.00001);assert.equal(map.zoom,.68);
});

test('labels are the topmost map layer, 30 percent smaller, and water uses a faucet pin',()=>{
  const {renderer,data,events}=load();const svg=renderer.drawScene({},events);
  assert(svg.lastIndexOf('class="city-labels"')>svg.indexOf('id="cityMarkers"'));
  for(const label of data.streetLabels)assert(svg.includes('font-size="'+Math.round(label.size*.7*100)/100+'"'));
  assert.equal(events.find(e=>e.id==='u1').icon,'tap');
  assert(svg.includes('A16,16 0 1 1 16,-24'));assert(!svg.includes('class="marker-stem"'));
  assert(fs.readFileSync(path.join(root,'index.html'),'utf8').includes('id="i-tap"'));
  assert(fs.readFileSync(path.join(root,'styles.css'),'utf8').includes('background:#f4f7fc'));
});


test('underground forest cannot paint over roads or the continuous utility network',()=>{
  const {renderer,events}=load();
  for(const flat of [false,true]){
    const svg=renderer.drawScene({flat},events);
    assert(svg.indexOf('class="city-forest"')<svg.indexOf('class="city-pipes"'));
    assert(svg.indexOf('class="city-pipes"')<svg.indexOf('class="city-roads"'));
    assert.equal((svg.match(/class="city-pipes"/g)||[]).length,1);
  }
  const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
  assert(css.includes('.map-shell[data-layer="under"] .city-roads{opacity:.75}'));
  assert(css.includes('.map-shell[data-layer="under"] .city-buildings{opacity:.75}'));
  assert(css.includes('.map-shell[data-layer="ground"] .city-roads{opacity:.82}'));
  assert(css.includes('.map-shell[data-layer="above"] .city-roads{opacity:.55}'));
});

test('affected houses inherit branch status on their existing walls and roofs, only under ground',()=>{
  const {renderer,geometry,data,events}=load();
  const svg=renderer.drawScene({},events);
  const affected=geometry.paintedNetworks.get(geometry.networkModel()).houses;
  assert(affected.some(house=>house.eventId==='u1'));assert(affected.some(house=>house.eventId==='u2'));
  const buildings=paths(group(svg,'city-buildings'));
  assert.equal(buildings.filter(tag=>attr(tag,'data-building')).length,data.buildings.length);
  for(const house of affected){
    const tags=buildings.filter(tag=>attr(tag,'data-building')===house.building||attr(tag,'data-building-wall')===house.building);
    assert.equal(tags.length,2);
    for(const tag of tags){
      assert.equal(attr(tag,'data-affected-event'),house.eventId);
      assert((attr(tag,'class')||'').includes('network-affected'));
      assert.equal(attr(tag,'style'),'--affected-color:'+(house.eventId==='u1'?'#c94343':'#d8a31c'));
    }
  }
  const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
  assert(css.includes('.map-shell[data-layer="under"] .network-affected{fill:var(--affected-color)}'));
  assert(!/\}\s*\.network-affected\{/.test(css));
  const cleared=renderer.drawScene({},[]);assert(!cleared.includes('data-affected-event'));
  const finished=plain(events);finished.find(e=>e.id==='u2').status='done';
  const changed=renderer.drawScene({},finished);
  assert(paths(group(changed,'city-buildings')).some(tag=>attr(tag,'data-affected-event')==='u2'&&attr(tag,'style')==='--affected-color:#27834e'));
});


test('grove display paths can be suppressed without losing source road geometry or search',()=>{
  const {context,renderer,data}=load();
  assert(data.roads.filter(road=>'visibleP' in road).length>30);
  context.window.CITY_DATA={...data,roads:[{id:'grove-path',n:'Test street',k:'footway',p:[[100,100],[200,100]],visibleP:[]}]};
  const svg=renderer.drawScene();
  assert.equal(paths(group(svg,'city-roads')).length,0);
  assert.deepEqual(plain(renderer.nearestRoadPoint('Test street',[101,100])),[100,100]);
  assert.deepEqual(plain(context.window.CITY_DATA.roads[0].p),[[100,100],[200,100]]);
});

test('marker labels are replaced by a compact card and the underground road overlay is hidden',()=>{
  const {renderer,events}=load();assert(!renderer.drawScene({},events,'u1').includes('class="marker-tag"'));
  const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
  assert(css.includes('.map-shell[data-layer="under"] .city-roads,.map-shell[data-layer="under"] .city-active-roads{display:none}'));
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert(html.includes('id="mapEventPopup" role="dialog"'));assert(html.includes('aria-modal="false"'));
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  assert(app.includes('events,showMapPopup)'));assert(app.includes('data-popup-details>Узнать подробнее'));
});


test('utility extent is independent of the road clip for the restored perimeter main',()=>{
  const {renderer,data}=load();assert(data.networkBoundary.length>0);
  const svg=renderer.drawScene();
  const clip=svg.match(/<clipPath id="city-pipe-clip">([\s\S]*?)<\/clipPath>/)[1];
  const expected=data.networkBoundary.map((point,index)=>{const p=renderer.project(point,-12,{});return (index?'L':'M')+p.join(',');}).join('')+'Z';
  assert.equal(attr(paths(clip)[0],'d'),expected);
});
