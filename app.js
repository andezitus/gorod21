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
  const waterPoint = R.nearestUtilityPoint('улица Эльгера',D.landmarks.water);
  const events = [
    {id:'u1',layer:'under',type:'outage',status:'planned',icon:'tap',title:'Отключение воды',short:'Отключение воды',address:'улица Эльгера · у улицы Мичмана Павлова',point:waterPoint,deadline:'18 окт, 18:00',description:'Запланировано отключение холодной воды для ремонта трубы. После работ восстановят дорожное покрытие.',restriction:'18 октября с 09:00 до 18:00 в соседних домах не будет холодной воды.',owner:'Аварийная бригада водоканала',source:'Демонстрационный план коммунальных работ',updated:'17 окт, 10:00',story:true},
    {id:'u2',layer:'under',type:'work',status:'work',icon:'wrench',title:'Ремонт теплосети',short:'Ремонт теплосети',address:'улица Гузовского · жилой квартал',point:R.nearestUtilityPoint('улица Гузовского',D.landmarks.heat),deadline:'18 окт, 17:00',description:'Бригада заменяет участок теплосети. После проверки герметичности его подключат к системе.',restriction:'Участок огражден. Проход по соседнему тротуару открыт.',owner:'Теплоснабжающая организация',source:'Демонстрационный план коммунальных работ',updated:'17 окт, 10:15'},
    {id:'g1',layer:'ground',type:'work',status:'planned',icon:'road',title:'Ремонт дороги',short:'Ремонт дороги',roadName:'улица Эльгера',address:'улица Эльгера · у улицы Мичмана Павлова',point:waterPoint,deadline:'19 окт, 18:00',description:'После ремонта трубы подрядчик засыплет траншею и восстановит асфальтовое покрытие.',restriction:'Во время ремонта участок проезда будет ограничен. Следуйте временным знакам.',owner:'Подрядчик по благоустройству',source:'Демонстрационный связанный этап работ',updated:'17 окт, 10:00',story:true},
    {id:'g2',layer:'ground',type:'report',status:'work',icon:'snow',title:'Оледенение дороги',short:'Оледенение дороги',roadName:'Университетская улица',address:'Университетская улица · участок проезда',point:snap('Университетская улица',D.landmarks.sidewalk),deadline:'17 окт, 14:00',description:'На дороге образовалась наледь. Дорожная служба обрабатывает покрытие противогололедным материалом.',restriction:'Скользкий участок. Снизьте скорость и соблюдайте дистанцию.',owner:'Муниципальная дорожная служба',source:'Демонстрационное обращение жителя',updated:'17 окт, 10:20'},
    {id:'a1',layer:'above',type:'report',status:'done',icon:'spray',title:'Граффити на фасаде здания',short:'Граффити на фасаде',address:'улица Эльгера · здание',point:building(D.landmarks.facade),deadline:'17 окт, 09:30',description:'Надпись на фасаде удалена, отделка восстановлена. В демонстрационном сценарии работы выполнены.',restriction:'Ограничения сняты. Проход вдоль фасада открыт.',owner:'Управляющая организация',source:'Демонстрационное обращение жителя',updated:'17 окт, 09:40'},
    {id:'a2',layer:'above',type:'work',status:'work',icon:'light',title:'Ремонт освещения',short:'Ремонт освещения',address:'проспект Максима Горького · пешеходная зона',point:snap('проспект Максима Горького',D.landmarks.light),deadline:'17 окт, 21:00',description:'Бригада проверяет питание и заменяет неисправные светильники вдоль пешеходной зоны.',restriction:'На части участка освещение временно работает не в полном объеме.',owner:'Служба наружного освещения',source:'Демонстрационное сообщение службы',updated:'17 окт, 10:25'}
  ];
  const statusText = {work:'В работе',planned:'Запланировано',done:'Выполнено'};
  const statusClass = event => `status-${R.eventColorCategory(event)}`;
  const typeText={report:'Обращение',work:'Работы',outage:'Отключение'};
  function read(key,fallback){try{const v=localStorage.getItem('gorod21:'+key);return v?JSON.parse(v):fallback;}catch{return fallback;}}
  function write(key,v){try{localStorage.setItem('gorod21:'+key,JSON.stringify(v));}catch{/* The current session remains usable when browser storage is disabled. */}}
  const loadedSaved=read('saved',[]),loadedReports=read('reports',[]),loadedHome=read('home',null);
  const state={layer:'above',filter:'all',selected:null,saved:Array.isArray(loadedSaved)?loadedSaved.filter(x=>events.some(e=>e.id===x)):[],reports:Array.isArray(loadedReports)?loadedReports.filter(x=>x&&typeof x.description==='string'):[],home:restoreHome(loadedHome),radius:500};
  if(state.home&&state.home!==loadedHome)write('home',state.home);
  const map=new window.CityMap($('cityMap'),$('mapViewport'),events,showMapPopup);
  let toastTimeout;
  let popupEventId=null;
  function toast(message){clearTimeout(toastTimeout);$('toast').querySelector('span').textContent=message;$('toast').classList.add('visible');toastTimeout=setTimeout(()=>$('toast').classList.remove('visible'),4300);}
  function updateMainMenu(){
    const active=$('reportModal').open?'reportsNav':$('homeModal').open?'homeNav':$('activityModal').open?($('activityModal').dataset.mode==='reports'?'reportsNav':'savedNav'):'mapNav';
    for(const id of ['mapNav','homeNav','savedNav','reportsNav']){$(id).classList.toggle('active',id===active);$(id).setAttribute('aria-pressed',String(id===active));}
  }
  function openModal(id){const d=$(id);if(!d.open)d.showModal();updateMainMenu();}
  function closeModal(id){$(id).close();}
  function uiScale(){return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'))||1;}
  function isMobile(){return matchMedia(`(max-width:${760*uiScale()}px)`).matches;}
  function setLayer(layer,keepDetail=false){
    if(!layers[layer])return;
    closeMapPopup();
    state.layer=layer;state.filter='all';$('mapShell').dataset.layer=layer;
    for(const button of document.querySelectorAll('.layer-tab')){const selected=button.dataset.layer===layer;button.classList.toggle('selected',selected);button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}
    const meta=layers[layer];$('layerDropdownLabel').textContent=meta.name;$('layerSwitcher').classList.remove('dropdown-open');$('layerDropdownToggle').setAttribute('aria-expanded','false');$('mapLayerTitle').textContent=meta.title;$('mapLayerDescription').textContent=meta.description;$('captionIcon').querySelector('use').setAttribute('href','#i-'+meta.icon);$('captionLevel').textContent=meta.level;$('listLayerName').textContent=meta.name;
    map.setLayer(layer);
    if(!keepDetail){state.selected=null;closeDetail();map.setSelected(events.find(e=>e.layer===layer)?.id||'');}
    updateFilterButtons();renderList();
  }
  function updateFilterButtons(){closeMapPopup();for(const b of document.querySelectorAll('[data-filter]')){const selected=state.filter===b.dataset.filter;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));}map.setFilter(state.filter);}
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
  function workStages(e){
    const shared=[
      ['Раскопки и подготовка участка','Подрядчик подготавливает и ограждает место работ.'],
      ['Ремонт трубы','Водоканал заменяет участок, проверяет его и восстанавливает подачу воды.'],
      ['Восстановление асфальта','Подрядчик восстанавливает покрытие и проверяет результат.']
    ];
    const progress={
      u1:{current:0,steps:shared},g1:{current:2,steps:shared},
      u2:{current:1,steps:[
        ['Обследование и подготовка','Определён повреждённый участок, подготовлено место работ.'],
        ['Замена участка теплосети','Бригада заменяет повреждённую часть трубопровода.'],
        ['Испытания и проверка герметичности','Проверка соединений и испытания отремонтированного участка.'],
        ['Подключение и восстановление участка','Возобновление работы сети и приведение места ремонта в порядок.']
      ]},
      g2:{current:1,steps:[
        ['Осмотр и оценка наледи','Дорожная служба определила границы скользкого участка.'],
        ['Обработка дороги','Покрытие обрабатывают противогололёдным материалом.'],
        ['Контроль состояния покрытия','Проверка результата обработки и безопасности проезда.'],
        ['Завершение работ','Подтверждение устранения наледи и снятие ограничений.']
      ]},
      a2:{current:1,steps:[
        ['Обследование и проверка питания','Проверена линия питания, выявлены неисправные светильники.'],
        ['Замена и ремонт светильников','Бригада восстанавливает освещение пешеходной зоны.'],
        ['Проверка освещения','Контроль работы светильников и электрических соединений.'],
        ['Завершение и приёмка работ','Подтверждение исправности освещения и закрытие работ.']
      ]}
    };
    if(e.status!=='planned'&&e.status!=='work')return null;
    const model=progress[e.id];if(!model)return null;
    return e.status==='planned'?{current:0,steps:[['Стадия планирования','Согласование объёма, сроков и ответственных за работы.'],...model.steps]}:model;
  }
  function workStory(e){
    const progress=workStages(e);if(!progress)return '';
    const stages=progress.steps.map(([title,description],index)=>{
      const phase=index<progress.current?'complete':index===progress.current?'current':'pending';
      const label=phase==='complete'?'Завершено':phase==='current'?'Текущий этап':'Предстоит';
      return `<li class="work-step is-${phase}"${phase==='current'?' aria-current="step"':''}><span class="story-node" aria-hidden="true">${phase==='complete'?icon('check'):index+1}</span><div class="work-step-body"><b>${escapeHTML(title)}</b><span class="work-step-state">${label}</span><small>${escapeHTML(description)}</small></div></li>`;
    }).join('');
    const related=e.story?`<div class="work-related"><button type="button" class="story-link" data-go-event="${e.id==='u1'?'g1':'u1'}" aria-label="${e.id==='u1'?'Посмотреть ремонт дороги на среднем слое':'Посмотреть отключение воды на нижнем слое'}">${icon('layers')}<span>Посмотреть на ${e.id==='u1'?'среднем':'нижнем'} слое</span>${icon('arrow')}</button></div>`:'';
    return `<section class="work-progress" data-progress-status="${escapeHTML(e.status)}" aria-labelledby="workProgressTitle"><h4 class="story-title" id="workProgressTitle">Ход работ</h4><ol class="work-story" aria-label="Этапы выполнения работ">${stages}</ol>${related}</section>`;
  }
  function bindScenarioCarousel(){
    const gallery=$('detailContent').querySelector('[data-scenario-carousel]');if(!gallery)return;
    const track=gallery.querySelector('[data-carousel-track]'),slides=Array.from(track.querySelectorAll('[data-carousel-slide]'));
    const dots=Array.from(gallery.querySelectorAll('[data-carousel-go]')),arrows=Array.from(gallery.querySelectorAll('[data-carousel-step]'));
    const position=gallery.querySelector('[data-carousel-position]');
    let active=-1;
    const width=()=>track.clientWidth||track.getBoundingClientRect().width;
    const current=()=>Math.max(0,Math.min(slides.length-1,Math.round(track.scrollLeft/(width()||1))));
    const update=()=>{
      const index=current();
      if(index===active)return;active=index;
      slides.forEach((slide,i)=>slide.setAttribute('aria-hidden',String(i!==index)));
      dots.forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.carouselGo)===index)));
      arrows.forEach(button=>{button.disabled=Number(button.dataset.carouselStep)<0?index===0:index===slides.length-1;});
      position.textContent=`${index===0?'До':'После'} · ${index+1} из ${slides.length}`;
    };
    const go=index=>{track.scrollLeft=Math.max(0,Math.min(slides.length-1,index))*width();update();};
    dots.forEach(button=>button.addEventListener('click',()=>go(Number(button.dataset.carouselGo))));
    arrows.forEach(button=>button.addEventListener('click',()=>go(current()+Number(button.dataset.carouselStep))));
    track.addEventListener('scroll',update,{passive:true});
    track.addEventListener('keydown',event=>{
      const keys={ArrowLeft:current()-1,ArrowRight:current()+1,Home:0,End:slides.length-1};
      if(!(event.key in keys))return;
      event.preventDefault();go(keys[event.key]);
    });
    track.scrollLeft=0;update();
  }
  function renderDetail(){
    const e=events.find(e=>e.id===state.selected);if(!e)return;
    const followed=state.saved.includes(e.id);
    const affected={u1:'Холодное водоснабжение соседних домов',u2:'Дома, подключённые к участку теплосети',g1:'Проезд на участке ремонтных работ',g2:'Участок дороги с наледью',a1:'Фасад здания',a2:'Освещение пешеходной зоны'};
    const illustration={tap:'water',wrench:'heating',road:'road',spray:'graffiti',snow:'ice',light:'lighting'}[e.icon];
    const workPhoto={
      u2:{width:900,height:600,alt:'Рабочие ремонтируют трубы теплосети в открытой траншее.'},
      g2:{width:960,height:539,alt:'Дорожная машина распределяет противогололёдный материал по зимней дороге.'},
      a2:{width:960,height:594,alt:'Мастер на подъёмнике ремонтирует уличный светильник.'}
    }[e.id];
    const sceneAlt={tap:'Иллюстрация отключения воды: сухой кран, пустое ведро и перекрытый водопровод.',wrench:'Иллюстрация ремонта теплосети: повреждённая труба в раскопанном участке.',road:'Иллюстрация ремонта дороги: снятый асфальт, гравий и ограждение участка.',spray:'Иллюстрация граффити: следы краски на фасаде жилого здания.',snow:'Иллюстрация оледенения дороги: скользкое покрытие во дворе.',light:'Иллюстрация неисправного освещения: повреждённый фонарь и инструменты для ремонта.'}[e.icon];
    const scene=e.status==='planned'?`<figure class="scenario-scene scenario-scene-empty"><div class="scenario-scene-placeholder"><svg class="scenario-empty-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="16" r="13"/><path d="M16 9v9"/><circle class="scenario-empty-dot" cx="16" cy="23" r="1"/></svg><strong>Изображения отсутствуют</strong></div><figcaption>Изображения появятся, как только объект перейдет в стадию выполнения работ.</figcaption></figure>`:e.id==='a1'?`<figure class="scenario-scene scenario-carousel" data-scenario-carousel aria-label="Фасад здания до и после очистки">
      <div class="scenario-carousel-track" id="graffitiCarouselTrack" data-carousel-track tabindex="0" role="region" aria-roledescription="карусель" aria-label="До и после. Листайте горизонтально или используйте стрелки на клавиатуре">
        <div class="scenario-carousel-slide" data-carousel-slide role="group" aria-roledescription="слайд" aria-label="1 из 2: до очистки"><span class="scenario-carousel-badge">До</span><img src="./assets/events/scenes/graffiti-before.webp" width="960" height="720" alt="Фасад до очистки: граффити на белой кирпичной стене." loading="lazy" decoding="async" draggable="false"></div>
        <div class="scenario-carousel-slide" data-carousel-slide role="group" aria-roledescription="слайд" aria-label="2 из 2: после очистки" aria-hidden="true"><span class="scenario-carousel-badge">После</span><img src="./assets/events/scenes/graffiti-after.webp" width="960" height="720" alt="Тот же фасад после очистки: белая кирпичная стена без граффити." loading="lazy" decoding="async" draggable="false"></div>
      </div>
      <figcaption><div class="scenario-carousel-toolbar"><span data-carousel-position aria-live="polite" aria-atomic="true">До · 1 из 2</span><div class="scenario-carousel-nav" aria-label="Переключение изображений"><button type="button" class="carousel-arrow" data-carousel-step="-1" aria-controls="graffitiCarouselTrack" aria-label="Предыдущее изображение" disabled>${icon('back')}</button><button type="button" class="carousel-dot" data-carousel-go="0" aria-controls="graffitiCarouselTrack" aria-label="Показать фото до очистки" aria-pressed="true"><span></span></button><button type="button" class="carousel-dot" data-carousel-go="1" aria-controls="graffitiCarouselTrack" aria-label="Показать изображение после очистки" aria-pressed="false"><span></span></button><button type="button" class="carousel-arrow" data-carousel-step="1" aria-controls="graffitiCarouselTrack" aria-label="Следующее изображение">${icon('arrow')}</button></div></div><span class="scenario-carousel-note">Иллюстрация результата очистки</span></figcaption>
    </figure>`:illustration?`<figure class="scenario-scene"><img src="./assets/events/scenes/${illustration}.webp${workPhoto?'?v=20261019-work-photos':''}" width="${workPhoto?.width||960}" height="${workPhoto?.height||640}"${workPhoto?` style="aspect-ratio:${workPhoto.width}/${workPhoto.height}"`:''} alt="${escapeHTML(workPhoto?.alt||sceneAlt||e.title)}" loading="lazy" decoding="async"><figcaption>Иллюстрация события</figcaption></figure>`:'';
    $('detailContent').innerHTML=`<button type="button" class="detail-back" id="detailBack">${icon('back')}Все события на слое</button>
      <section class="scenario-summary" aria-label="Основная информация о событии">
        <div class="scenario-heading">
          <span class="scenario-illustration" aria-hidden="true">${illustration?`<img src="./assets/events/${illustration}.webp" width="256" height="256" alt="" decoding="async">`:icon(e.icon)}</span>
          <div><h3>${escapeHTML(e.title)}</h3><div class="detail-address">${escapeHTML(e.address)}</div><span class="status-pill scenario-status ${statusClass(e)}"><i aria-hidden="true"></i>${statusText[e.status]}</span></div>
        </div>
        <dl class="scenario-facts">
          <div><dt>${icon('home')}Затронуто</dt><dd>${escapeHTML(affected[e.id]||e.address)}</dd></div>
          <div><dt>${icon('build')}Выполняет работы</dt><dd>${escapeHTML(e.owner)}</dd></div>
          <div><dt>${icon('clock')}Плановое завершение</dt><dd>${escapeHTML(e.deadline)}</dd></div>
        </dl>
        <div class="scenario-provenance">
          <div class="scenario-source">${icon('info')}<div><small>Источник информации</small><b>${escapeHTML(e.source)}</b></div></div>
          <div class="scenario-source">${icon('clock')}<div><small>Обновлено</small><b>${escapeHTML(e.updated)}</b></div></div>
        </div>
      </section>
      <div class="scenario-more">${scene}<h4>Подробности события</h4><p class="detail-description">${escapeHTML(e.description)}</p><div class="restriction"><b>Ограничения для жителей</b>${escapeHTML(e.restriction)}</div>${workStory(e)}<button type="button" class="follow-button ${followed?'followed':''}" id="followEvent" aria-pressed="${followed}">${icon(followed?'check':'bell')}${followed?'Вы следите за событием':'Следить за событием'}</button></div>`;
    bindScenarioCarousel();
  }
  function closeMapPopup(restoreFocus=false){
    const id=popupEventId;popupEventId=null;$('mapEventPopup').hidden=true;
    if(restoreFocus&&id)map.markerNodes.find(node=>node.dataset.eventId===id)?.focus({preventScroll:true});
  }
  function positionMapPopup(){
    if(!popupEventId||$('mapEventPopup').hidden)return;
    const anchor=map.markerScreenPoint(popupEventId);if(!anchor)return;
    const shell=$('mapShell').getBoundingClientRect(),popup=$('mapEventPopup');
    const scale=uiScale();
    const width=shell.width/scale||$('mapShell').clientWidth,height=shell.height/scale||$('mapShell').clientHeight;
    if(!width||!height)return;
    const rect=popup.getBoundingClientRect(),popupWidth=rect.width/scale||Math.min(324,width-24),popupHeight=rect.height/scale||Math.min(390,height-24);
    const x=(anchor.x-shell.left)/scale,y=(anchor.y-shell.top)/scale;
    const preferred=x+22+popupWidth<=width-12?x+22:x-popupWidth-22;
    popup.style.left=Math.max(12,Math.min(preferred,width-popupWidth-12))+'px';
    popup.style.top=Math.max(12,Math.min(y-popupHeight/2,height-popupHeight-12))+'px';
  }
  function showMapPopup(id){
    const event=events.find(item=>item.id===id);if(!event)return;
    closeDetail();popupEventId=id;map.setSelected(id);map.setFilter(state.filter);
    const popup=$('mapEventPopup');popup.dataset.popupEvent=id;
    popup.innerHTML=`<button type="button" class="map-popup-close" data-popup-close aria-label="Закрыть карточку">${icon('x')}</button><h3 id="mapPopupTitle">${escapeHTML(event.title)}</h3><span class="status-pill ${statusClass(event)}"><i aria-hidden="true"></i>${statusText[event.status]}</span><div class="map-popup-body"><dl class="map-popup-facts"><div><dt>${icon('build')}Ответственный</dt><dd>${escapeHTML(event.owner)}</dd></div><div><dt>${icon('calendar')}Плановый срок</dt><dd>${escapeHTML(event.deadline)}</dd></div><div><dt>${icon('database')}Источник данных</dt><dd>${escapeHTML(event.source)}</dd></div></dl><small class="map-popup-updated">Обновлено: ${escapeHTML(event.updated)} · демо</small></div><button type="button" class="map-popup-details" data-popup-details>Узнать подробнее</button>`;
    popup.hidden=false;$('mapTip').hidden=true;positionMapPopup();
    popup.querySelector('[data-popup-details]').focus({preventScroll:true});
  }
  function revealEventsPanel(){
    document.querySelector('.workspace').classList.remove('desktop-panels-hidden');
    const toggle=$('desktopPanelsToggle');toggle.setAttribute('aria-expanded','true');toggle.setAttribute('aria-label','Скрыть события');toggle.title='Скрыть события';
  }
  function openEvent(id){
    closeMapPopup();
    const e=events.find(e=>e.id===id);if(!e)return;
    if(state.layer!==e.layer)setLayer(e.layer,true);
    state.filter='all';updateFilterButtons();renderList();state.selected=id;
    revealEventsPanel();map.setSelected(id);$('detailContent').hidden=false;$('panelContent').hidden=true;$('eventsPanel').classList.add('show-detail');renderDetail();$('detailContent').scrollTop=0;
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
  function restoreHome(home){
    if(!home||typeof home.address!=='string'||!Array.isArray(home.point))return null;
    if(home.mapId===D.id)return home;
    const location=locateAddress(home.address);
    return location?{...home,point:location.point,mapId:D.id}:null;
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
    $('activityModal').dataset.mode=mode;
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
    const scale=uiScale(),width=$('mapViewport').getBoundingClientRect().width/scale,svgWidth=isMobile()?width*1.6:width;
    const cssPxPerUnit=Math.min(svgWidth/1200,$('mapViewport').getBoundingClientRect().height/scale/880);
    const b=D.bounds,mpp=(b[2]-b[0])*111320*Math.cos(56.15*Math.PI/180)/D.w;
    const targetPx=isMobile()?47:67;
    const meters=targetPx/(cssPxPerUnit*(D.projection?.scale||.91)*map.zoom)*mpp;
    const choices=[50,100,200,300,500,1000];
    const nearest=choices.reduce((best,x)=>Math.abs(x-meters)<Math.abs(best-meters)?x:best,choices[0]);
    $('scaleLine').style.width=(nearest/mpp*cssPxPerUnit*(D.projection?.scale||.91)*map.zoom)+'px';$('scaleLabel').textContent=nearest===1000?'1 км':nearest+' м';
    $('zoomIn').disabled=map.zoom>=map.maxZoom-.01;$('zoomOut').disabled=map.zoom<=map.minZoom+.001;
  }
  function search(query){
    if(isMobile()){$('layerSwitcher').classList.remove('dropdown-open');$('layerDropdownToggle').setAttribute('aria-expanded','false');closeMapPopup();}
    const results=$('searchResults'),q=query.trim().toLowerCase();
    if(q.length<2){results.hidden=true;return;}
    const eventQuery=q==='вода'?'вод':q;
    const match=events.filter(e=>(e.title+' '+e.address+' '+layers[e.layer].name).toLowerCase().includes(eventQuery)).slice(0,5);
    const streets=[...new Set(D.roads.map(r=>r.n).filter(Boolean))].filter(n=>normalizeStreet(n).includes(normalizeStreet(q))).slice(0,3);
    let html=match.map(e=>`<button type="button" data-search-event="${e.id}">${icon(e.icon)}<span>${escapeHTML(e.title)}<small>${escapeHTML(e.address)}</small></span></button>`).join('');
    html+=streets.map(n=>`<button type="button" data-search-street="${escapeHTML(n)}">${icon('pin')}<span>${escapeHTML(n)}<small>Улица на карте Чебоксар</small></span></button>`).join('');
    results.innerHTML=html||'<div class="empty-search">В этой части города ничего не найдено. Попробуйте «Эльгера», «Гузовского» или «вода».</div>';results.hidden=false;
  }

  $('mapEventPopup').addEventListener('click',event=>{
    if(event.target.closest('[data-popup-close]'))closeMapPopup(true);
    if(event.target.closest('[data-popup-details]')&&popupEventId){const id=popupEventId;openEvent(id);$('detailBack').focus({preventScroll:true});}
  });
  $('mapEventPopup').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeMapPopup(true);}});
  window.addEventListener('mapmove',positionMapPopup);
  window.addEventListener('resize',positionMapPopup);
  window.addEventListener('mapbackground',()=>closeMapPopup());

  document.querySelectorAll('.layer-tab').forEach(b=>{
    b.addEventListener('click',()=>setLayer(b.dataset.layer));
    b.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const tabs=[...document.querySelectorAll('.layer-tab')],i=tabs.indexOf(b),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowDown'?1:-1)+tabs.length)%tabs.length;setLayer(tabs[next].dataset.layer);tabs[next].focus();});
  });
  $('layerDropdownToggle').addEventListener('click',()=>{const open=!$('layerSwitcher').classList.contains('dropdown-open');if(open&&isMobile()){$('searchResults').hidden=true;$('mapSearch').blur();closeMapPopup();}$('layerSwitcher').classList.toggle('dropdown-open',open);$('layerDropdownToggle').setAttribute('aria-expanded',String(open));});
  $('desktopPanelsToggle').addEventListener('click',()=>{const expanded=$('desktopPanelsToggle').getAttribute('aria-expanded')==='true',nextExpanded=!expanded;document.querySelector('.workspace').classList.toggle('desktop-panels-hidden',!nextExpanded);$('desktopPanelsToggle').setAttribute('aria-expanded',String(nextExpanded));$('desktopPanelsToggle').setAttribute('aria-label',nextExpanded?'Скрыть события':'Показать события');$('desktopPanelsToggle').title=nextExpanded?'Скрыть события':'Показать события';});
  document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{state.filter=b.dataset.filter;updateFilterButtons();renderList();}));
  $('eventList').addEventListener('click',e=>{const b=e.target.closest('[data-open-event]');if(b)openEvent(b.dataset.openEvent);});
  $('detailContent').addEventListener('click',e=>{
    if(e.target.closest('#detailBack')){const current=state.selected;closeDetail();map.setSelected(current);renderList();return;}
    if(e.target.closest('#followEvent')){toggleFollow();return;}
    const go=e.target.closest('[data-go-event]');if(go){openEvent(go.dataset.goEvent);$('detailBack').focus({preventScroll:true});}
  });
  document.querySelectorAll('[data-about]').forEach(b=>b.addEventListener('click',()=>openModal('aboutModal')));
  document.querySelectorAll('[data-report]').forEach(b=>b.addEventListener('click',()=>{$('reportLayer').value=state.layer;openModal('reportModal');}));
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',updateMainMenu));
  for(const d of document.querySelectorAll('dialog'))d.addEventListener('click',e=>{if(e.target===d){const rect=d.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)d.close();}});
  for(const id of ['homeNav','setupHomeBtn'])$(id).addEventListener('click',showHome);
  $('homeBtn').addEventListener('click',showAccount);
  document.querySelectorAll('[data-account-mode]').forEach(button=>button.addEventListener('click',()=>setAccountMode(button.dataset.accountMode)));
  $('mapNav').addEventListener('click',()=>{closeDetail();closeMapPopup();if(isMobile()){$('eventsPanel').classList.remove('expanded');$('panelToggle').setAttribute('aria-expanded','false');$('panelToggle').setAttribute('aria-label','Развернуть список событий');}map.reset();renderList();updateScale();updateMainMenu();$('mapViewport').focus();});
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
    if(!location){$('homeAddress').setCustomValidity('Выберите улицу в выделенном районе, например улицу Эльгера.');$('homeAddress').reportValidity();return;}
    state.home={address,radius:state.radius,point:location.point,exact:location.exact,mapId:D.id};write('home',state.home);closeModal('homeModal');updateHome();map.focus(location.point);toast(location.exact?'Адрес сохранен. Ваша зона показана на карте.':'Адрес сохранен. Дом отмечен приблизительно по улице.');
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
  setLayer(state.layer);updateHome();updateActivityIndicator();updateScale();
  if(read('hideTip',false))$('mapTip').hidden=true;
  $('dismissTip').addEventListener('click',()=>write('hideTip',true));
  window.GOROD21_DATA={events,layers,version:'2.0',geographicSource:'OpenStreetMap',openEvent,setLayer,locateAddress};
})();
