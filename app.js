(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const escapeHTML = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const R = window.GorodMapRenderer, D = window.CITY_DATA;
  const layers = {
    above:{name:'Над землей',title:'Город над поверхностью',description:'Фасады, освещение и воздушные линии',icon:'build',level:'+1'},
    ground:{name:'На земле',title:'На уровне вашей прогулки',description:'Дороги, тротуары и благоустройство',icon:'road',level:'0'},
    under:{name:'Под землей',title:'Под поверхностью города',description:'Водопровод, теплосети и канализация',icon:'drop',level:'−1'}
  };
  const snap = (name, p) => R.nearestRoadPoint(name, p);
  const building = p => {const b=R.nearestBuilding(p);return b?R.center(b.p):p;};
  const waterPoint = snap('Московский проспект',[461,516]);
  const events = [
    {id:'u1',layer:'under',type:'outage',status:'work',icon:'drop',title:'Авария на водопроводе',short:'Авария водопровода',address:'Московский проспект · у залива',point:waterPoint,deadline:'15 окт, 18:00',description:'Поврежден участок водопровода. Бригада заменяет трубу. После завершения ремонта восстановят дорожное покрытие.',restriction:'Холодная вода временно отключена в соседних домах. Проход через место раскопок ограничен.',owner:'Аварийная бригада водоканала',source:'Пример сообщения коммунальной организации',updated:'14 окт, 17:40',story:true},
    {id:'u2',layer:'under',type:'work',status:'work',icon:'wrench',title:'Замена участка теплосети',short:'Ремонт теплосети',address:'ул. Константина Иванова',point:snap('улица Константина Иванова',[650,335]),deadline:'16 окт, 17:00',description:'Проводится плановая замена участка теплосети. После проверки герметичности участок подключат к системе.',restriction:'Вдоль места работ установлено ограждение. Проход по соседнему тротуару открыт.',owner:'Теплоснабжающая организация',source:'Пример плана коммунальных работ',updated:'14 окт, 17:15'},
    {id:'u3',layer:'under',type:'outage',status:'planned',icon:'drop',title:'Плановое отключение воды',short:'Плановое отключение',address:'ул. Пирогова · жилой квартал',point:snap('улица Пирогова',[266,672]),deadline:'16 окт, 13:00',description:'Для обслуживания запорной арматуры планируется кратковременное отключение холодного водоснабжения.',restriction:'Холодная вода: 16 октября, с 09:00 до 13:00.',owner:'Коммунальная служба водоснабжения',source:'Уведомление о плановом отключении',updated:'14 окт, 16:50'},
    {id:'g1',layer:'ground',type:'work',status:'planned',icon:'road',title:'Восстановление асфальта',short:'Восстановление дороги',address:'Московский проспект · у залива',point:waterPoint,deadline:'16 окт, 18:00',description:'После устранения аварии на водопроводе подрядчик засыплет траншею и восстановит асфальтовое покрытие.',restriction:'Участок возле раскопок огражден. Восстановление покрытия начнется после завершения работ на трубе.',owner:'Подрядчик по благоустройству',source:'Пример связанного этапа муниципальных работ',updated:'14 окт, 17:40',story:true},
    {id:'g2',layer:'ground',type:'report',status:'confirmed',icon:'cone',title:'Повреждение покрытия во дворе',short:'Яма во дворе',address:'Московский район · жилой двор',point:building([244,530]),deadline:'17 окт, 12:00',description:'Житель сообщил о поврежденном покрытии на проезде во дворе. В примере обращение проверено и передано дорожной службе.',restriction:'На участке неровное покрытие. При проезде нужна осторожность.',owner:'Муниципальная дорожная служба',source:'Проверенное обращение жителя · пример',updated:'14 окт, 15:20'},
    {id:'g3',layer:'ground',type:'work',status:'work',icon:'cone',title:'Ремонт тротуара',short:'Благоустройство',address:'Историческая часть · у залива',point:snap('улица Константина Иванова',[777,382]),deadline:'17 окт, 18:00',description:'Выполняется ремонт тротуара: заменяют поврежденные элементы покрытия и приводят в порядок примыкания.',restriction:'Часть тротуара закрыта. Обход организован по соседней пешеходной дорожке.',owner:'Служба городского благоустройства',source:'Пример карточки текущих работ',updated:'14 окт, 17:05'},
    {id:'a1',layer:'above',type:'report',status:'confirmed',icon:'build',title:'Повреждение фасада',short:'Обращение по фасаду',address:'ул. Константина Иванова · жилой дом',point:building([628,344]),deadline:'16 окт, 12:00',description:'Житель сообщил о повреждении отделки фасада. Управляющая организация назначила обследование.',restriction:'У фасада огражден небольшой участок. Пожалуйста, используйте соседний проход.',owner:'Управляющая организация',source:'Проверенное обращение жителя',updated:'14 окт, 16:30'},
    {id:'a2',layer:'above',type:'work',status:'work',icon:'light',title:'Восстановление освещения',short:'Ремонт освещения',address:'Московский проспект · пешеходная зона',point:snap('Московский проспект',[275,485]),deadline:'15 окт, 21:00',description:'Бригада проверяет линию питания и заменяет неисправные светильники вдоль пешеходной зоны.',restriction:'На части участка освещение временно работает не в полном объеме.',owner:'Служба наружного освещения',source:'Пример сообщения обслуживающей службы',updated:'14 окт, 17:25'},
    {id:'a3',layer:'above',type:'work',status:'planned',icon:'home',title:'Плановый ремонт кровли',short:'Работы на кровле',address:'Московский район · жилой дом',point:building([377,664]),deadline:'18 окт, 18:00',description:'Управляющая организация планирует локальный ремонт кровли. Работы выполнят после подготовки безопасной зоны.',restriction:'На время ремонта участок у входа будет огражден. Основной вход останется открытым.',owner:'Управляющая организация',source:'Пример плана работ управляющей компании',updated:'14 окт, 14:50'}
  ];
  const statusText = {work:'В работе',planned:'Запланировано',confirmed:'Проверено'};
  const statusClass = event => `status-${R.eventColorCategory(event)}`;
  const typeText={report:'Обращение',work:'Работы',outage:'Отключение'};
  function read(key,fallback){try{const v=localStorage.getItem('gorod21:'+key);return v?JSON.parse(v):fallback;}catch{return fallback;}}
  function write(key,v){try{localStorage.setItem('gorod21:'+key,JSON.stringify(v));}catch{/* The current session remains usable when browser storage is disabled. */}}
  const loadedSaved=read('saved',[]),loadedReports=read('reports',[]),loadedHome=read('home',null);
  const state={layer:'under',filter:'all',selected:null,saved:Array.isArray(loadedSaved)?loadedSaved.filter(x=>events.some(e=>e.id===x)):[],reports:Array.isArray(loadedReports)?loadedReports.filter(x=>x&&typeof x.description==='string'):[],home:loadedHome&&typeof loadedHome.address==='string'&&Array.isArray(loadedHome.point)?loadedHome:null,radius:500};
  const map=new window.CityMap($('cityMap'),$('mapViewport'),events,openEvent);
  let toastTimeout;
  function toast(message){clearTimeout(toastTimeout);$('toast').querySelector('span').textContent=message;$('toast').classList.add('visible');toastTimeout=setTimeout(()=>$('toast').classList.remove('visible'),4300);}
  function openModal(id){const d=$(id);if(!d.open)d.showModal();}
  function closeModal(id){$(id).close();}
  function isMobile(){return matchMedia('(max-width:760px)').matches;}
  function setLayer(layer,keepDetail=false){
    if(!layers[layer])return;
    state.layer=layer;state.filter='all';$('mapShell').dataset.layer=layer;
    for(const button of document.querySelectorAll('.layer-tab')){const selected=button.dataset.layer===layer;button.classList.toggle('selected',selected);button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}
    const meta=layers[layer];$('layerDropdownLabel').textContent=meta.name;$('layerSwitcher').classList.remove('dropdown-open');$('layerDropdownToggle').setAttribute('aria-expanded','false');$('mapLayerTitle').textContent=meta.title;$('mapLayerDescription').textContent=meta.description;$('captionIcon').querySelector('use').setAttribute('href','#i-'+meta.icon);$('captionLevel').textContent=meta.level;$('listLayerName').textContent=meta.name;
    map.setLayer(layer);
    if(!keepDetail){state.selected=null;closeDetail();map.setSelected(events.find(e=>e.layer===layer)?.id||'');}
    updateFilterButtons();renderList();
  }
  function updateFilterButtons(){for(const b of document.querySelectorAll('[data-filter]')){const selected=state.filter===b.dataset.filter;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));}map.setFilter(state.filter);}
  function renderList(){
    const shown=events.filter(e=>e.layer===state.layer&&(state.filter==='all'||e.type===state.filter));
    $('eventCount').textContent=shown.length;
    $('eventList').innerHTML=shown.length?shown.map(e=>`<button type="button" class="event-card" data-open-event="${e.id}" data-status-color="${R.eventColorCategory(e)}" aria-label="${escapeHTML(e.title+'. '+e.address)}"><div class="event-top"><span class="event-symbol ${statusClass(e)}">${icon(e.icon)}</span><span class="status-pill ${statusClass(e)}">${statusText[e.status]}</span></div><h3>${escapeHTML(e.title)}</h3><p>${escapeHTML(e.address)}</p><div class="event-bottom">${icon('clock')}<span>До ${escapeHTML(e.deadline)}</span>${icon('arrow')}</div></button>`).join(''):`<div class="empty-state">${icon('layers')}<strong>На этом слое таких событий нет</strong>Выберите другой фильтр или уровень города.</div>`;
    $('statReports').textContent=events.filter(e=>e.type==='report').length;$('statWorks').textContent=events.filter(e=>e.type==='work').length;$('statOutages').textContent=events.filter(e=>e.type==='outage').length;
  }
  function closeDetail(){
    $('detailContent').hidden=true;$('panelContent').hidden=false;$('eventsPanel').classList.remove('show-detail');
    state.selected=null;
  }
  function workStory(e){
    return `<h4 class="story-title">Одна проблема — одна история<span>3 связанных этапа</span></h4><ol class="work-story"><li class="current"><span class="story-node">${icon('wrench')}</span><div><b>Ремонт трубы</b><small>Водоканал · выполняется</small>${e.id!=='u1'?'<button type="button" class="story-link inline-action" data-go-event="u1">Посмотреть на нижнем слое →</button>':''}</div></li><li class="current"><span class="story-node">${icon('cone')}</span><div><b>Раскопки и подготовка участка</b><small>Подрядчик · выполняется</small></div></li><li><span class="story-node"></span><div><b>Восстановление асфальта</b><small>Благоустройство · после ремонта трубы</small>${e.id!=='g1'?'<button type="button" class="story-link inline-action" data-go-event="g1">Посмотреть на среднем слое →</button>':''}</div></li></ol>`;
  }
  function renderDetail(){
    const e=events.find(e=>e.id===state.selected);if(!e)return;
    const followed=state.saved.includes(e.id);
    $('detailContent').innerHTML=`<button type="button" class="detail-back" id="detailBack">${icon('back')}Все события на слое</button><div class="detail-hero"><span class="event-symbol ${statusClass(e)}">${icon(e.icon)}</span><span class="status-pill ${statusClass(e)}">${statusText[e.status]}</span></div><h3>${escapeHTML(e.title)}</h3><div class="detail-address">${icon('pin')}<span>${escapeHTML(e.address)}</span></div><p class="detail-description">${escapeHTML(e.description)}</p><div class="restriction"><b>Ограничения для жителей</b>${escapeHTML(e.restriction)}</div><dl class="detail-facts"><div><dt>Плановый срок завершения</dt><dd>${escapeHTML(e.deadline)} · условно</dd></div><div><dt>Ответственная организация</dt><dd>${escapeHTML(e.owner)} · сведения не подтверждены</dd></div></dl>${e.story?workStory(e):''}<button type="button" class="follow-button ${followed?'followed':''}" id="followEvent" aria-pressed="${followed}">${icon(followed?'check':'bell')}${followed?'Вы следите за событием':'Следить за событием'}</button><div class="source-block"><b>Источник: ${escapeHTML(e.source)}</b>Обновлено: ${escapeHTML(e.updated)}<br>Событие и сроки не подтверждены городскими службами.</div>`;
  }
  function openEvent(id){
    const e=events.find(e=>e.id===id);if(!e)return;
    if(state.layer!==e.layer)setLayer(e.layer,true);
    state.filter='all';updateFilterButtons();renderList();state.selected=id;
    map.setSelected(id);$('detailContent').hidden=false;$('panelContent').hidden=true;$('eventsPanel').classList.add('show-detail');renderDetail();
    $('mapTip').hidden=true;
    if(isMobile()){$('eventsPanel').classList.add('expanded');$('panelToggle').setAttribute('aria-expanded','true');}
  }
  function updateActivityIndicator(){
    $('notificationDot').hidden=!state.saved.length&&!state.home;$('reportDot').hidden=!state.reports.length;
  }
  function toggleFollow(){
    const id=state.selected;if(!id)return;
    if(state.saved.includes(id)){state.saved=state.saved.filter(x=>x!==id);toast('Подписка на событие отключена');}
    else{state.saved.push(id);toast('Событие добавлено в ваши подписки');}
    write('saved',state.saved);updateActivityIndicator();renderDetail();
  }
  function normalizeStreet(s){return String(s).toLowerCase().replace(/\u0451/g,'е').replace(/чебоксары|улица|ул\.?|проспект|пр-?кт|бульвар|бул\.?/g,' ').replace(/[^а-яa-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();}
  function locateAddress(address){
    const q=normalizeStreet(address), streetQuery=q.replace(/\d+[а-я]?/g,'').trim();
    if(streetQuery.length<3)return null;
    const exactBuildings=D.buildings.filter(b=>b.a.trim()&&normalizeStreet(b.a)===q);
    if(exactBuildings.length)return {point:R.center(exactBuildings[0].p),exact:true};
    const matched=D.roads.filter(r=>r.n&&(normalizeStreet(r.n)===streetQuery||normalizeStreet(r.n).includes(streetQuery)||streetQuery.includes(normalizeStreet(r.n))));
    if(!matched.length)return null;
    const points=matched.flatMap(r=>r.p),center=R.center(points);
    let nearest=points[0];for(const p of points)if(R.dist(p,center)<R.dist(nearest,center))nearest=p;
    return {point:[...nearest],exact:false,name:matched[0].n};
  }
  function metersBetween(p,q){const b=D.bounds,mpp=(b[2]-b[0])*111320*Math.cos(56.15*Math.PI/180)/D.w;return R.dist(p,q)*mpp;}
  function updateHome(){
    const prompt=document.querySelector('.home-prompt');
    if(state.home){
      const n=events.filter(e=>metersBetween(e.point,state.home.point)<=state.home.radius).length;
      prompt.querySelector('h3').textContent=state.home.address;
      prompt.querySelector('p').textContent=`${n} событий в радиусе ${state.home.radius===1000?'1 км':state.home.radius+' м'}. Круг на карте обозначает вашу зону внимания.`;
      $('setupHomeBtn').innerHTML='Изменить мой дом'+icon('arrow');
      map.setHome(state.home);
    }
    updateActivityIndicator();
  }
  function showHome(){
    $('homeAddress').setCustomValidity('');$('homeAddress').value=state.home?.address||'';state.radius=state.home?.radius||500;
    for(const b of document.querySelectorAll('[data-radius]'))b.classList.toggle('selected',Number(b.dataset.radius)===state.radius);
    openModal('homeModal');
  }
  function setAccountMode(mode){
    for(const button of document.querySelectorAll('[data-account-mode]')){const selected=button.dataset.accountMode===mode;button.classList.toggle('selected',selected);button.setAttribute('aria-selected',String(selected));}
    $('loginForm').hidden=mode!=='login';$('registerForm').hidden=mode!=='register';
  }
  function showAccount(){setAccountMode('login');openModal('accountModal');}
  function showActivity(mode='saved'){
    const reports=mode==='reports';$('activityTitle').textContent=reports?'Мои обращения':'Подписки и уведомления';$('activityIcon').querySelector('use').setAttribute('href',reports?'#i-inbox':'#i-bell');
    let html='';
    if(reports){
      html='<p class="activity-subtitle">Обращения сохраняются только в этом браузере и не отправляются городским службам.</p>';
      html+=state.reports.length?state.reports.map(r=>`<article class="activity-item"><span class="event-symbol">${icon(layers[r.layer]?.icon||'pin')}</span><div><span class="status-pill review">На проверке</span><b>${escapeHTML(r.description.slice(0,90))}${r.description.length>90?'…':''}</b><p>${escapeHTML(r.address)}</p><small>${escapeHTML(r.date)} · ${escapeHTML(layers[r.layer]?.name||'Город')}</small></div></article>`).join(''):`<div class="activity-empty">${icon('inbox')}Пока нет обращений. Если заметили городскую проблему, расскажите о ней.</div>`;
      html+='<button type="button" class="primary-button full-width" data-new-report>'+icon('plus')+'Создать обращение</button>';
    }else{
      html='<p class="activity-subtitle">Сохраненные события и зона вашего дома. Сведения о статусах не подтверждены городскими службами; push-уведомления не подключены.</p>';
      if(state.home)html+=`<div class="activity-home">${icon('home')}<div><b>${escapeHTML(state.home.address)}</b>Радиус ${state.home.radius===1000?'1 км':state.home.radius+' м'}</div></div>`;
      const saved=events.filter(e=>state.saved.includes(e.id));
      html+=saved.length?saved.map(e=>`<button type="button" class="activity-item" data-activity-event="${e.id}" data-status-color="${R.eventColorCategory(e)}"><span class="event-symbol ${statusClass(e)}">${icon(e.icon)}</span><div><b>${escapeHTML(e.title)}</b><p>${escapeHTML(e.address)}</p><span class="status-pill ${statusClass(e)}">${statusText[e.status]}</span><small>До ${escapeHTML(e.deadline)}</small></div></button>`).join(''):`<div class="activity-empty">${icon('bookmark')}Вы еще не следите за событиями. Нажмите «Следить за событием» в карточке на карте.</div>`;
      html+='<button type="button" class="inline-action" data-setup-home>'+(state.home?'Изменить адрес дома':'Добавить мой дом')+' →</button>';
    }
    $('activityBody').innerHTML=html;openModal('activityModal');
  }
  function updateScale(){
    const width=$('mapViewport').getBoundingClientRect().width,svgWidth=isMobile()?width*1.6:width;
    const cssPxPerUnit=Math.min(svgWidth/1200,$('mapViewport').getBoundingClientRect().height/880);
    const b=D.bounds,mpp=(b[2]-b[0])*111320*Math.cos(56.15*Math.PI/180)/D.w;
    const targetPx=isMobile()?47:67;
    const meters=targetPx/(cssPxPerUnit*.91*map.zoom)*mpp;
    const choices=[50,100,200,300,500,1000];
    const nearest=choices.reduce((best,x)=>Math.abs(x-meters)<Math.abs(best-meters)?x:best,choices[0]);
    $('scaleLine').style.width=(nearest/mpp*cssPxPerUnit*.91*map.zoom)+'px';$('scaleLabel').textContent=nearest===1000?'1 км':nearest+' м';
    $('zoomIn').disabled=map.zoom>=3.59;$('zoomOut').disabled=map.zoom<=.681;
  }
  function search(query){
    const results=$('searchResults'),q=query.trim().toLowerCase();
    if(q.length<2){results.hidden=true;return;}
    const eventQuery=q==='вода'?'вод':q;
    const match=events.filter(e=>(e.title+' '+e.address+' '+layers[e.layer].name).toLowerCase().includes(eventQuery)).slice(0,5);
    const streets=[...new Set(D.roads.map(r=>r.n).filter(Boolean))].filter(n=>normalizeStreet(n).includes(normalizeStreet(q))).slice(0,3);
    let html=match.map(e=>`<button type="button" data-search-event="${e.id}">${icon(e.icon)}<span>${escapeHTML(e.title)}<small>${escapeHTML(e.address)}</small></span></button>`).join('');
    html+=streets.map(n=>`<button type="button" data-search-street="${escapeHTML(n)}">${icon('pin')}<span>${escapeHTML(n)}<small>Улица на карте Чебоксар</small></span></button>`).join('');
    results.innerHTML=html||'<div class="empty-search">В этой части города ничего не найдено. Попробуйте «Московский», «Иванова» или «вода».</div>';results.hidden=false;
  }

  document.querySelectorAll('.layer-tab').forEach(b=>{
    b.addEventListener('click',()=>setLayer(b.dataset.layer));
    b.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const tabs=[...document.querySelectorAll('.layer-tab')],i=tabs.indexOf(b),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowDown'?1:-1)+tabs.length)%tabs.length;setLayer(tabs[next].dataset.layer);tabs[next].focus();});
  });
  $('layerDropdownToggle').addEventListener('click',()=>{const open=!$('layerSwitcher').classList.contains('dropdown-open');$('layerSwitcher').classList.toggle('dropdown-open',open);$('layerDropdownToggle').setAttribute('aria-expanded',String(open));});
  $('desktopPanelsToggle').addEventListener('click',()=>{const expanded=$('desktopPanelsToggle').getAttribute('aria-expanded')==='true',nextExpanded=!expanded;document.querySelector('.workspace').classList.toggle('desktop-panels-hidden',!nextExpanded);$('desktopPanelsToggle').setAttribute('aria-expanded',String(nextExpanded));$('desktopPanelsToggle').setAttribute('aria-label',nextExpanded?'Скрыть события':'Показать события');$('desktopPanelsToggle').title=nextExpanded?'Скрыть события':'Показать события';});
  document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{state.filter=b.dataset.filter;updateFilterButtons();renderList();}));
  $('eventList').addEventListener('click',e=>{const b=e.target.closest('[data-open-event]');if(b)openEvent(b.dataset.openEvent);});
  $('detailContent').addEventListener('click',e=>{
    if(e.target.closest('#detailBack')){const current=state.selected;closeDetail();map.setSelected(current);renderList();return;}
    if(e.target.closest('#followEvent')){toggleFollow();return;}
    const go=e.target.closest('[data-go-event]');if(go)openEvent(go.dataset.goEvent);
  });
  document.querySelectorAll('[data-about]').forEach(b=>b.addEventListener('click',()=>openModal('aboutModal')));
  document.querySelectorAll('[data-report]').forEach(b=>b.addEventListener('click',()=>{$('reportLayer').value=state.layer;openModal('reportModal');}));
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  for(const d of document.querySelectorAll('dialog'))d.addEventListener('click',e=>{if(e.target===d){const rect=d.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)d.close();}});
  for(const id of ['homeNav','setupHomeBtn'])$(id).addEventListener('click',showHome);
  $('homeBtn').addEventListener('click',showAccount);
  document.querySelectorAll('[data-account-mode]').forEach(button=>button.addEventListener('click',()=>setAccountMode(button.dataset.accountMode)));
  $('mapNav').addEventListener('click',()=>{closeDetail();map.reset();renderList();updateScale();$('mapViewport').focus();});
  $('savedNav').addEventListener('click',()=>showActivity());$('notificationsBtn').addEventListener('click',()=>showActivity());$('reportsNav').addEventListener('click',()=>showActivity('reports'));
  $('activityBody').addEventListener('click',e=>{
    const item=e.target.closest('[data-activity-event]');if(item){closeModal('activityModal');openEvent(item.dataset.activityEvent);return;}
    if(e.target.closest('[data-new-report]')){closeModal('activityModal');$('reportLayer').value=state.layer;openModal('reportModal');}
    if(e.target.closest('[data-setup-home]')){closeModal('activityModal');showHome();}
  });
  $('reportForm').addEventListener('submit',e=>{
    e.preventDefault();const description=$('reportDescription').value.trim(),address=$('reportAddress').value.trim();
    if(description.length<10){$('reportDescription').setCustomValidity('Добавьте описание длиной от 10 символов.');$('reportDescription').reportValidity();return;}
    if(!address){$('reportAddress').setCustomValidity('Укажите адрес.');$('reportAddress').reportValidity();return;}
    const date=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'}).format(new Date());
    state.reports.unshift({id:window.crypto?.randomUUID?.()||String(Date.now()),layer:$('reportLayer').value,address,description,date});
    write('reports',state.reports);$('reportForm').reset();closeModal('reportModal');updateActivityIndicator();toast('Обращение сохранено в этом браузере. Статус: на проверке.');
  });
  $('reportDescription').addEventListener('input',()=>$('reportDescription').setCustomValidity(''));$('reportAddress').addEventListener('input',()=>$('reportAddress').setCustomValidity(''));
  $('homeAddress').addEventListener('input',()=>$('homeAddress').setCustomValidity(''));
  $('homeForm').addEventListener('submit',e=>{
    e.preventDefault();const address=$('homeAddress').value.trim(),location=locateAddress(address);
    if(!location){$('homeAddress').setCustomValidity('Выберите улицу в центре Чебоксар, например Московский проспект.');$('homeAddress').reportValidity();return;}
    state.home={address,radius:state.radius,point:location.point,exact:location.exact};write('home',state.home);closeModal('homeModal');updateHome();map.focus(location.point);toast(location.exact?'Адрес сохранен. Ваша зона показана на карте.':'Адрес сохранен. Дом отмечен приблизительно по улице.');
  });
  document.querySelectorAll('[data-radius]').forEach(b=>b.addEventListener('click',()=>{state.radius=Number(b.dataset.radius);for(const other of document.querySelectorAll('[data-radius]'))other.classList.toggle('selected',other===b);}));
  const streetNames=[...new Set(D.roads.map(r=>r.n).filter(Boolean))].sort();$('streetOptions').innerHTML=streetNames.map(n=>`<option value="${escapeHTML(n)}"></option>`).join('');
  $('zoomIn').addEventListener('click',()=>{map.changeZoom(1.2);updateScale();});$('zoomOut').addEventListener('click',()=>{map.changeZoom(1/1.2);updateScale();});$('resetMap').addEventListener('click',()=>{map.reset();updateScale();});
  $('viewMode').addEventListener('click',()=>{const flat=map.toggleView();map.setFilter(state.filter);$('viewMode').textContent=flat?'2D':'3D';$('viewMode').setAttribute('aria-pressed',String(flat));$('viewMode').setAttribute('aria-label',flat?'Переключить на объемную карту':'Переключить на плоскую карту');});
  window.addEventListener('mapzoom',updateScale);window.addEventListener('resize',updateScale);
  $('dismissTip').addEventListener('click',()=>$('mapTip').hidden=true);
  $('panelToggle').addEventListener('click',()=>{if($('eventsPanel').classList.contains('show-detail')){closeDetail();}$('eventsPanel').classList.toggle('expanded');const expanded=$('eventsPanel').classList.contains('expanded');$('panelToggle').setAttribute('aria-expanded',String(expanded));$('panelToggle').setAttribute('aria-label',expanded?'Свернуть список событий':'Развернуть список событий');});
  $('mapSearch').addEventListener('input',e=>search(e.target.value));$('mapSearch').addEventListener('focus',()=>search($('mapSearch').value));
  $('mapSearch').addEventListener('keydown',e=>{if(e.key==='Escape'){$('searchResults').hidden=true;$('mapSearch').blur();}if(e.key==='Enter'){$('searchResults').querySelector('button')?.click();}});
  $('searchResults').addEventListener('click',e=>{
    const event=e.target.closest('[data-search-event]'),street=e.target.closest('[data-search-street]');
    if(event){openEvent(event.dataset.searchEvent);const item=events.find(x=>x.id===event.dataset.searchEvent);map.focus(item.point);}
    else if(street){const location=locateAddress(street.dataset.searchStreet);if(location){map.focus(location.point);toast(street.dataset.searchStreet+' — в центре карты');}}
    $('searchResults').hidden=true;$('mapSearch').blur();
  });
  document.addEventListener('click',e=>{if(!e.target.closest('.map-search-wrap'))$('searchResults').hidden=true;});
  document.addEventListener('keydown',e=>{if(e.key==='/'&&!document.querySelector('dialog[open]')&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();$('mapSearch').focus();}});
  renderList();updateHome();updateActivityIndicator();updateScale();
  if(read('hideTip',false))$('mapTip').hidden=true;
  $('dismissTip').addEventListener('click',()=>write('hideTip',true));
  window.GOROD21_DATA={events,layers,version:'1.0',geographicSource:'OpenStreetMap',openEvent,setLayer,locateAddress};
})();
