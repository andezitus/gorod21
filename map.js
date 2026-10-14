/* Geographic rendering uses OSM building footprints and roads. Utility lines are illustrative. */
(function () {
  'use strict';
  const W = 1200, H = 880;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const round = n => Math.round(n * 100) / 100;
  function project(p, z = 0, options = {}) {
    const d = window.CITY_DATA;
    const a = (options.rotation || 0) * Math.PI / 180 + (options.flat ? 0 : -24 * Math.PI / 180);
    const x = p[0] - d.w / 2, y = p[1] - d.h / 2;
    const rx = x * Math.cos(a) - y * Math.sin(a);
    const ry = x * Math.sin(a) + y * Math.cos(a);
    return [round(600 + rx * .91), round(438 + ry * (options.flat ? .88 : .61) - (options.flat ? 0 : z))];
  }
  function path(points, z, opt, close = false) {
    return points.map((p, i) => {const c = project(p, z, opt);return `${i ? 'L' : 'M'}${c[0]},${c[1]}`;}).join('') + (close ? 'Z' : '');
  }
  function center(poly) {return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];}
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  function nearestBuilding(p) {
    let min = Infinity, best = null;
    for (const b of window.CITY_DATA.buildings) {const n = dist(p, center(b.p));if (n < min) {min = n;best = b;}}
    return best;
  }
  function nearestRoadPoint(name, target) {
    let best = target, distance = Infinity;
    for (const road of window.CITY_DATA.roads) if (road.n === name) for (const p of road.p) {const d = dist(p, target);if (d < distance) {distance = d;best = p;}}
    return [...best];
  }
  function geographicPoint(lon, lat) {
    const d = window.CITY_DATA, b = d.bounds;
    return [(lon - b[0]) / (b[2] - b[0]) * d.w, (b[3] - lat) / (b[3] - b[1]) * d.h];
  }
  function eventColorCategory(event) {
    if (event.type === 'outage') return 'outage';
    if (event.status === 'work' || event.status === 'planned') return 'active';
    if (event.status === 'confirmed') return 'confirmed';
    return 'unknown';
  }
  function marker(event, opt, selected) {
    const roof = event.layer === 'above' ? (nearestBuilding(event.point)?.h || 18) * .85 + 4 : event.layer === 'under' ? -16 : 2;
    const [x, y] = project(event.point, roof, opt);
    const colorCategory = eventColorCategory(event);
    const tag = event.short || event.title;
    const tagWidth = Math.min(192, tag.length * 5.1 + 20);
    return `<g class="city-marker status-${colorCategory} ${selected ? 'selected' : ''}" data-event-id="${esc(event.id)}" data-marker-layer="${esc(event.layer)}" transform="translate(${x},${y})" role="button" tabindex="0" aria-label="${esc(event.title + '. ' + event.address)}"><title>${esc(event.title + ' · ' + event.address)}</title>
      <ellipse cx="0" cy="0" rx="22" ry="9" fill="var(--marker-color, #267ee8)" fill-opacity=".12"/>
      <ellipse class="marker-ring" cx="0" cy="0" rx="26" ry="11" fill="none" stroke="var(--marker-color, #267ee8)" stroke-opacity=".4" stroke-width="1.1"/>
      <path class="marker-stem" d="M0,-18V-2"/>
      <circle class="marker-disc" cx="0" cy="-35" r="17" fill="var(--marker-color, #267ee8)" stroke="#f7fbff" stroke-width="2.5" filter="url(#pinShadow)"/>
      <path d="m-4-20 4 7 4-7" fill="var(--marker-color, #267ee8)"/>
      <use href="#i-${event.icon || 'drop'}" x="-9" y="-44" width="18" height="18" fill="none" stroke="var(--marker-icon-color, #fff)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
      <g class="marker-tag" style="display:${selected ? 'inline' : 'none'}"><rect x="25" y="-49" width="${tagWidth}" height="28" rx="7" fill="#ffffff" fill-opacity=".97" stroke="#d8e9fd" stroke-width=".7"/><text x="35" y="-32" font-family="Manrope, sans-serif" font-size="9" font-weight="700" fill="#5e8cbe">${esc(tag)}</text></g>
    </g>`;
  }
  const defs = `<defs>
    <linearGradient id="landGradient" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#edf5ff"/><stop offset="1" stop-color="#dbe9fb"/></linearGradient>
    <linearGradient id="waterGradient" x1="0" y1="0" x2=".4" y2="1"><stop stop-color="#bdd8f7"/><stop offset="1" stop-color="#d2e5fc"/></linearGradient>
    <linearGradient id="roofGradient" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#e3f0ff"/><stop offset="1" stop-color="#9fc8f7"/></linearGradient>
    <linearGradient id="hotRoof" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#84bfff"/><stop offset="1" stop-color="#3a8af0"/></linearGradient>
    <linearGradient id="pipeGradient" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#4babfb"/><stop offset=".5" stop-color="#2279e5"/><stop offset="1" stop-color="#74caff"/></linearGradient>
    <filter id="cityShadow" x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="15"/></filter>
    <filter id="pipeGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="pinShadow" x="-80%" y="-60%" width="260%" height="250%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#2f70bf" flood-opacity=".22"/></filter>
    <filter id="lightGlow"><feGaussianBlur stdDeviation="2.2"/></filter>
  </defs>`;
  function drawScene(opt = {}, events = [], selectedId = '') {
    const d = window.CITY_DATA;
    const corners = [[0,0],[d.w,0],[d.w,d.h],[0,d.h]];
    let out = defs + '<g id="mapWorld">';
    out += `<ellipse cx="624" cy="697" rx="414" ry="73" fill="#7ca7dc" opacity=".12" filter="url(#cityShadow)"/>`;
    out += `<g class="city-base-sides"><path d="${path(corners,-30,opt,true)}" fill="#d0e2f7" stroke="#b7d0ef" stroke-width=".8"/>`;
    for (let i = 0; i < 4; i++) {const a=corners[i], b=corners[(i+1)%4];out += `<path d="${path([a,b],0,opt)}L${project(b,-30,opt).join(',')}L${project(a,-30,opt).join(',')}Z" fill="${i%2 ? '#c4daf3':'#cee1f7'}" stroke="#bcd5f3" stroke-width=".5"/>`;}
    out += '</g>';
    out += `<g class="city-grid" stroke="#9fbee7" stroke-opacity=".28" stroke-width=".6" fill="none">`;
    for (let x=0;x<=d.w;x+=75) out += `<path d="${path([[x,0],[x,d.h]],-27,opt)}"/>`;
    for (let y=0;y<=d.h;y+=75) out += `<path d="${path([[0,y],[d.w,y]],-27,opt)}"/>`;
    out += '</g>';
    const mainRoads = d.roads.filter(r => ['primary','secondary','tertiary'].includes(r.k));
    out += '<g class="city-pipes" fill="none" stroke-linecap="round" stroke-linejoin="round">';
    for (let i=0; i<mainRoads.length; i++) {
      const r=mainRoads[i], width=r.k==='primary'?6.8:r.k==='secondary'?5.3:3.9;
      const line=path(r.p,-19,opt);
      out+=`<path d="${line}" stroke="#4c96ee" stroke-opacity=".16" stroke-width="${width+8}" filter="url(#pipeGlow)"/><path d="${line}" stroke="#407fca" stroke-width="${width+1.5}" opacity=".45" transform="translate(0,1.5)"/><path d="${line}" stroke="url(#pipeGradient)" stroke-width="${width}"/><path d="${line}" stroke="#c5eeff" stroke-width="${width*.25}" opacity=".85"/>`;
      if (i%14===0) out+=`<path class="pipe-pulse" d="${line}" stroke="#def5ff" stroke-width="1.7" stroke-opacity=".9"/>`;
    }
    const joints=[];
    for(const r of mainRoads) for(const p of [r.p[0],r.p.at(-1)]) if(!joints.some(q=>dist(p,q)<14)) joints.push(p);
    for(const p of joints) {const [x,y]=project(p,-19,opt);out+=`<circle cx="${x}" cy="${y}" r="3.4" fill="#86c7fb" stroke="#f0faff" stroke-width="1.1"/><circle cx="${x}" cy="${y}" r="1" fill="#4991da"/>`;}
    for(let i=0;i<d.buildings.length;i+=9){
      const p=center(d.buildings[i].p);let q=null,mini=Infinity;
      for(const joint of joints){const distance=dist(p,joint);if(distance<mini){mini=distance;q=joint;}}
      if(q&&mini<68) out+=`<path d="${path([q,[p[0],q[1]],p],-19,opt)}" stroke="#70b4ee" stroke-width="2.2" opacity=".6"/><path d="${path([q,[p[0],q[1]],p],-19,opt)}" stroke="#cceeff" stroke-width=".7" opacity=".65"/>`;
    }
    out+='</g>';
    out+=`<g class="city-land"><path d="${path(corners,0,opt,true)}" fill="url(#landGradient)" fill-opacity=".58" stroke="#d5e4f5" stroke-width="1"/>`;
    for(const park of d.parks) out+=`<path d="${path(park,.2,opt,true)}" fill="#cadaf0" fill-opacity=".55" stroke="#c2d7ed" stroke-opacity=".32" stroke-width=".5"/>`;
    out+='</g>';
    out+='<g class="city-water">';
    for(const water of d.water) out+=`<path d="${path(water.p,.3,opt,true)}" fill="url(#waterGradient)" fill-opacity=".73" stroke="#b1ccee" stroke-width="1.6"/>`;
    out+='</g>';
    out+='<g class="city-roads" fill="none" stroke-linecap="round" stroke-linejoin="round">';
    const widths={primary:8,secondary:6.5,tertiary:4.5,residential:3.2,unclassified:3.2,living_street:2.5,pedestrian:1.6,service:1.3,footway:.65};
    for(const r of d.roads){const width=widths[r.k]||2;out+=`<path d="${path(r.p,r.b?2:1,opt)}" stroke="${r.k==='footway'?'#d2e1f3':'#c2d7f1'}" stroke-width="${width+1.7}"/><path d="${path(r.p,r.b?2:1,opt)}" stroke="#f1f7ff" stroke-width="${width}"/>`;}
    out+='</g>';
    out+='<g class="city-active-roads" fill="none" stroke-linecap="round" stroke-linejoin="round">';
    for(const r of mainRoads) {const width=widths[r.k];out+=`<path d="${path(r.p,2,opt)}" stroke="#6fb5ff" stroke-width="${width+4}" stroke-opacity=".16"/><path d="${path(r.p,2,opt)}" stroke="${r.k==='primary'?'#408cec':'#6baff6'}" stroke-width="${width*.78}" stroke-opacity=".85"/><path d="${path(r.p,2,opt)}" stroke="#c7e7ff" stroke-width=".6" stroke-dasharray="5 7" stroke-opacity=".8"/>`;}
    out+='</g>';
    const hot=new Set(events.filter(e=>e.layer==='above').map(e=>nearestBuilding(e.point)?.id));
    const sorted=[...d.buildings].sort((a,b)=>project(center(a.p),0,opt)[1]-project(center(b.p),0,opt)[1]);
    out+='<g class="city-buildings" stroke-linejoin="round">';
    for(const b of sorted){
      const z=b.h*.85, p=b.p;
      if(!opt.flat){
        for(let j=0;j<p.length;j++){const a=p[j],c=p[(j+1)%p.length];const ap=project(a,0,opt),cp=project(c,0,opt);if(cp[0]<ap[0])continue;
          out+=`<path d="M${ap.join(',')}L${cp.join(',')}L${project(c,z,opt).join(',')}L${project(a,z,opt).join(',')}Z" fill="${hot.has(b.id)?'#6ba7ed':cp[1]>ap[1]?'#a9c9ef':'#c0d9f7'}" stroke="#83addf" stroke-opacity=".38" stroke-width=".65"/>`;
        }
      }
      out+=`<path data-building="${b.id}" d="${path(p,z,opt,true)}" fill="url(#${hot.has(b.id)?'hotRoof':'roofGradient'})" stroke="${hot.has(b.id)?'#5e9ced':'#a7c6eb'}" stroke-width="${hot.has(b.id)?1.3:.75}"/>`;
    }
    out+='</g>';
    out+='<g class="city-windows" fill="none" stroke="#81afe3" stroke-opacity=".32" stroke-width=".5">';
    if(!opt.flat) for(let i=0;i<sorted.length;i+=3){const b=sorted[i];if(b.h<12)continue;for(let j=0;j<b.p.length;j++){const a=b.p[j],c=b.p[(j+1)%b.p.length];if(project(c,0,opt)[0]<project(a,0,opt)[0])continue;for(let z=4;z<b.h*.85-3;z+=4)out+=`<path d="${path([a,c],z,opt)}"/>`;}}
    out+='</g>';
    out+='<g class="city-lights">';
    const lightPoints=mainRoads.filter(r=>r.n.includes('Иванова')||r.n.includes('Московский')).filter((_,i)=>i%3===0).map(r=>r.p[Math.floor(r.p.length/2)]);
    for(const p of lightPoints){const [x,y]=project([p[0]+6,p[1]+3],0,opt);out+=`<path d="M${x},${y}v-22h7" fill="none" stroke="#71a5ea" stroke-width="1.4"/><ellipse cx="${x+7}" cy="${y-22}" rx="8" ry="5" fill="#7abaff" opacity=".3" filter="url(#lightGlow)"/><ellipse cx="${x+7}" cy="${y-22}" rx="2.8" ry="1.4" fill="#408bf1"/>`;}
    out+='</g>';
    out+='<g class="city-labels" font-family="Manrope, sans-serif">';
    const labels=[{p:geographicPoint(47.227,56.157),t:'В О Л Г А',size:20,color:'#8eafd6',spacing:5},{p:geographicPoint(47.246,56.143),t:'Чебоксарский залив',size:11,color:'#7b9fcf',spacing:.5},{p:[285,470],t:'Московский проспект',size:8,color:'#8fa6c4'},{p:[684,334],t:'ул. Константина Иванова',size:7.5,color:'#8fa6c4'},{p:[211,657],t:'ул. Пирогова',size:7.5,color:'#91aacb'},{p:[799,690],t:'Президентский бульвар',size:7.5,color:'#91aacb'}];
    for(const l of labels){const [x,y]=project(l.p,1,opt);out+=`<text x="${x}" y="${y}" fill="${l.color}" font-size="${l.size}" text-anchor="middle" letter-spacing="${l.spacing||0}" font-weight="${l.size>10?600:500}" stroke="#e6f0fb" stroke-width="2.3" paint-order="stroke">${esc(l.t)}</text>`;}
    out+='</g>';
    out+='<g id="homeRadius"></g>';
    out+='<g id="cityMarkers">'+events.map(e=>marker(e,opt,e.id===selectedId)).join('')+'</g>';
    return out+'</g>';
  }

  class CityMap {
    constructor(svg, viewport, events, select) {
      this.svg=svg;this.viewport=viewport;this.events=events;this.select=select;this.layer='under';this.selected='u1';
      this.zoom=1;this.pan=[0,0];this.rotation=0;this.flat=false;this.home=null;this.drag=null;this.didDrag=false;
      this.render();this.bind();
    }
    options(){return {rotation:this.rotation,flat:this.flat};}
    render(){
      this.svg.innerHTML='<title>Карта Чебоксар — улицы, здания, залив и три уровня городских событий</title>'+drawScene(this.options(),this.events,this.selected);
      this.world=this.svg.querySelector('#mapWorld');this.setTransform();this.updateMarkers();this.updateHome();
    }
    setTransform(){if(this.world)this.world.setAttribute('transform',`translate(${this.pan[0]},${this.pan[1]}) translate(600,438) scale(${this.zoom}) translate(-600,-438)`);}
    setLayer(layer){this.layer=layer;this.updateMarkers();}
    updateMarkers(){
      for(const node of this.svg.querySelectorAll('[data-event-id]')){
        const show=node.dataset.markerLayer===this.layer;
        node.style.display=show?'':'none';node.setAttribute('aria-hidden',String(!show));node.setAttribute('tabindex',show?'0':'-1');
        node.classList.toggle('selected',node.dataset.eventId===this.selected);
        node.querySelector('.marker-tag').style.display=node.dataset.eventId===this.selected?'':'none';
      }
    }
    setSelected(id){this.selected=id;this.updateMarkers();}
    setFilter(type){for(const node of this.svg.querySelectorAll('[data-event-id]')){const e=this.events.find(e=>e.id===node.dataset.eventId);const show=e.layer===this.layer&&(type==='all'||e.type===type);node.style.display=show?'':'none';node.setAttribute('aria-hidden',String(!show));node.setAttribute('tabindex',show?'0':'-1');}}
    changeZoom(factor){this.zoom=Math.max(.68,Math.min(3.6,this.zoom*factor));this.setTransform();return this.zoom;}
    reset(){this.zoom=1;this.pan=[0,0];this.setTransform();}
    focus(p){const [x,y]=project(p,0,this.options());this.pan=[(600-x)*this.zoom,(465-y)*this.zoom];this.setTransform();}
    rotate(){this.rotation=(this.rotation+90)%360;this.pan=[0,0];this.render();}
    toggleView(){this.flat=!this.flat;this.render();return this.flat;}
    setHome(home){this.home=home;this.updateHome();}
    updateHome(){
      const root=this.svg.querySelector('#homeRadius');if(!root)return;
      if(!this.home?.point){root.innerHTML='';return;}
      const d=window.CITY_DATA,b=d.bounds,mpp=(b[2]-b[0])*111320*Math.cos(56.15*Math.PI/180)/d.w;
      const radius=this.home.radius/mpp,p=this.home.point,circle=Array.from({length:65},(_,i)=>[p[0]+Math.cos(i*Math.PI/32)*radius,p[1]+Math.sin(i*Math.PI/32)*radius]);
      const [x,y]=project(p,2,this.options());
      root.innerHTML=`<path d="${path(circle,2,this.options(),true)}" fill="#86bcff" fill-opacity=".09" stroke="#76a9e9" stroke-opacity=".7" stroke-width="1.4" stroke-dasharray="5 5"/><g transform="translate(${x},${y})"><circle r="13" fill="#fff" stroke="#4a94ed" stroke-width="1.6"/><use href="#i-home" x="-7" y="-7" width="14" height="14" fill="none" stroke="#3988e7" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    }
    svgPoint(event){const p=this.svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform(this.svg.getScreenCTM().inverse());}
    bind(){
      this.viewport.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('[data-event-id]'))return;const p=this.svgPoint(e);this.drag={id:e.pointerId,start:[p.x,p.y],pan:[...this.pan]};this.didDrag=false;this.viewport.setPointerCapture(e.pointerId);});
      this.viewport.addEventListener('pointermove',e=>{if(!this.drag||e.pointerId!==this.drag.id)return;const p=this.svgPoint(e);const dx=p.x-this.drag.start[0],dy=p.y-this.drag.start[1];if(Math.hypot(dx,dy)>3){this.didDrag=true;this.viewport.classList.add('dragging');}this.pan=[this.drag.pan[0]+dx,this.drag.pan[1]+dy];this.setTransform();});
      const end=()=>{this.drag=null;this.viewport.classList.remove('dragging');};
      this.viewport.addEventListener('pointerup',end);this.viewport.addEventListener('pointercancel',end);this.viewport.addEventListener('lostpointercapture',end);
      this.svg.addEventListener('click',e=>{const node=e.target.closest('[data-event-id]');if(node&&!this.didDrag)this.select(node.dataset.eventId);this.didDrag=false;});
      this.svg.addEventListener('keydown',e=>{const node=e.target.closest('[data-event-id]');if(node&&(e.key==='Enter'||e.key===' ')){e.preventDefault();this.select(node.dataset.eventId);}});
      this.viewport.addEventListener('wheel',e=>{e.preventDefault();this.changeZoom(e.deltaY<0?1.09:1/1.09);window.dispatchEvent(new CustomEvent('mapzoom'));},{passive:false});
      this.viewport.addEventListener('keydown',e=>{if(e.target.closest('[data-event-id]'))return;const actions={ArrowLeft:[30,0],ArrowRight:[-30,0],ArrowUp:[0,30],ArrowDown:[0,-30]};if(actions[e.key]){e.preventDefault();this.pan[0]+=actions[e.key][0];this.pan[1]+=actions[e.key][1];this.setTransform();}else if(e.key==='+'||e.key==='='){e.preventDefault();this.changeZoom(1.2);window.dispatchEvent(new CustomEvent('mapzoom'));}else if(e.key==='-'){e.preventDefault();this.changeZoom(1/1.2);window.dispatchEvent(new CustomEvent('mapzoom'));}});
    }
  }
  window.GorodMapRenderer={drawScene,project,nearestRoadPoint,nearestBuilding,geographicPoint,center,dist,eventColorCategory};
  window.CityMap=CityMap;
})();
