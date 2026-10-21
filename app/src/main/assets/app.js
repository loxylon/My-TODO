'use strict';
const $=id=>document.getElementById(id), M=Model, native=typeof Android!=='undefined';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state,screen='',selectedDate=M.day(),calendarMonth=new Date(),showCompleted=false,toastTimer;
const themes={
  sage:{name:'Sage',bg:'#15191e',panel:'#1c2228',raised:'#232b31',text:'#e7eae5',muted:'#8d999b',faint:'#607176',line:'#2b353b',accent:'#b5d6af',accentText:'#1d3325'},
  dracula:{name:'Dracula',bg:'#282a36',panel:'#303341',raised:'#3b3e50',text:'#f8f8f2',muted:'#aaa8c2',faint:'#85839f',line:'#44475a',accent:'#bd93f9',accentText:'#28223e'},
  nord:{name:'Nord',bg:'#242b36',panel:'#2e3745',raised:'#394556',text:'#eceff4',muted:'#a2b1c6',faint:'#7f91a9',line:'#3d495b',accent:'#88c0d0',accentText:'#203b48'},
  rose:{name:'Rosé Pine',bg:'#191724',panel:'#211f30',raised:'#2b283d',text:'#e0def4',muted:'#aaa5bf',faint:'#827c99',line:'#353146',accent:'#ebbcba',accentText:'#432f3d'},
  paper:{name:'Paper',bg:'#f5f3ee',panel:'#fffefa',raised:'#e9e7df',text:'#303831',muted:'#727a70',faint:'#848a80',line:'#dedfd5',accent:'#52775b',accentText:'#ffffff'},
  midnight:{name:'Midnight',bg:'#0e1118',panel:'#161c28',raised:'#202b3e',text:'#e2e9fa',muted:'#9caac4',faint:'#657c9f',line:'#263247',accent:'#8daef0',accentText:'#142a4d'}
};
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2800);}
function backupSource(kind){return native?Android.backup(kind):localStorage.getItem('mytodo-'+kind)||'';}
function read(){try{
  const raw=native?Android.read():localStorage.getItem('mytodo');if(!raw)return M.initial();
  const parsed=JSON.parse(raw),old=parsed.schema!==3,result=M.validate(parsed);
  if(!native&&old)localStorage.setItem('mytodo-beforeMigration',raw);
  return result;
}catch(e){toast('Ошибка чтения. Данные не перезаписаны.');throw e;}}
function persist(restoring=false){
  if(native){const result=JSON.parse(restoring?Android.restore(JSON.stringify(state)):Android.save(JSON.stringify(state)));if(result.error){const e=Error(result.error);e.conflict=result.conflict;throw e;}state=result;}
  else{if(restoring){const old=localStorage.getItem('mytodo');if(old)localStorage.setItem('mytodo-beforeImport',old);}else M.moveOverdue(state);localStorage.setItem('mytodo',JSON.stringify(state));}
}
function commit(action,xp=0,message='',restoring=false){const before=JSON.stringify(state);try{action();state.xp+=xp;persist(restoring);render();if(message||xp)toast(message+(xp?`${message?' · ':''}+${xp} XP`:''));return true;}catch(e){state=e.conflict?read():JSON.parse(before);if(e.conflict){close();render();}toast(e.message||'Не удалось сохранить');return false;}}
function applyTheme(){const t=themes[state.theme]||themes.sage;for(const [k,v] of Object.entries(t))if(k!=='name')document.documentElement.style.setProperty('--'+k.replace(/[A-Z]/g,m=>'-'+m.toLowerCase()),v);document.documentElement.style.colorScheme=state.theme==='paper'?'light':'dark';if(native)Android.colors(t.bg,state.theme==='paper');}
function hours(h){if(h===0)return 'без задержки';if(h<1)return `${Math.round(h*60)} мин`;if(h%24===0)return `${h/24} д`;return `${h} ч`;}
function clock(ts){return new Date(ts).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});}
function reminderText(t){if(M.day(t.reminder)===M.day())return clock(t.reminder);return new Date(t.reminder).toLocaleDateString('ru-RU',{day:'numeric',month:'short'})+' · '+clock(t.reminder);}
function exactTime(ts){return new Date(ts).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});}
function cooldownText(h){return h===0?'0 ч':h<1?`${Math.round(h*60)} мин`:`${h} ч`;}
function remaining(ms){let t=Math.ceil(ms/1000);const d=Math.floor(t/86400);t%=86400;const h=Math.floor(t/3600);t%=3600;const m=Math.floor(t/60),sec=t%60;return `${d?d+' д ':''}${h?h+' ч ':''}${m?m+' мин ':''}${sec} с`;}
function availabilityHTML(p){
  const a=M.availability(state,p),duration=`КД по тегам: ${cooldownText(a.cooldownMillis/M.HOUR)}`;
  if(a.kind==='excluded')return `<span class="chip off">Исключена из выбора</span><span>${duration}. Включите участие в выборе.</span>`;
  if(a.kind==='pending')return `<span class="chip">Уже в делах</span><span>Нельзя выбрать повторно, пока задача остаётся в списке дел.</span>`;
  if(a.kind==='cooldown')return `<span class="chip waiting">Доступна с ${esc(exactTime(a.availableAt))}</span><span>Осталось ${remaining(a.remainingMs)} · ${duration}</span>`;
  const reason=!p.lastSelected?'Первое добавление — без ожидания.':a.cooldownMillis?'Ожидание завершилось '+exactTime(a.availableAt)+'.':'Теги не задают задержку.';return `<span class="chip available">Можно выбрать сейчас</span><span>${duration} · ${esc(reason)}</span>`;
}
function refreshAvailability(){if(document.hidden||$('dialog').open||$('navigation').open)return;document.querySelectorAll('[data-availability]').forEach(el=>{const p=state.pool.find(p=>p.id===el.dataset.availability);if(p)el.innerHTML=availabilityHTML(p);});}
function visibleTasks(){
  if(screen==='history') return state.tasks.filter(t=>t.done);
  if(screen==='calendar') return M.tasksOnDate(state,selectedDate);
  if(screen) return state.tasks.filter(t=>t.project===screen);
  return M.todayTasks(state);
}
function dateText(date,options={day:'numeric',month:'long'}){return new Date(date+'T12:00:00').toLocaleDateString('ru-RU',options);}
function isProject(){return !!screen&&!['history','calendar'].includes(screen);}
function taskHTML(t){
  const project=state.projects.find(p=>p.id===t.project),meta=[];
  if(t.reminder)meta.push(`<span class="${t.reminder<Date.now()&&!t.done?'overdue':'reminder'}">◷ ${esc(reminderText(t))}</span>`);
  if(t.source)meta.push('<span class="auto-icon">↝</span><span>просьба</span>');
  if(project&&screen!==project.id)meta.push(`<span class="chip">${esc(project.name)}</span>`);
  if(M.isDated(t)&&(isProject()||t.date<M.day()||screen==='history'))meta.push(`<span>${t.date>M.day()?'на ':t.date<M.day()&&!t.done?'перенесено с ':''}${esc(dateText(t.date,{day:'numeric',month:'short'}))}</span>`);
  return `<div class="task ${t.done?'done':''}" data-task="${esc(t.id)}"><button class="check" data-complete="${esc(t.id)}" aria-label="${t.done?'Вернуть':'Выполнить'} ${esc(t.title)}" aria-pressed="${t.done}">${t.done?'✓':''}</button><button class="task-body" data-edit="${esc(t.id)}"><span class="task-title">${esc(t.title)}</span><span class="task-meta">${meta.join('')}</span></button><button class="dot" data-edit="${esc(t.id)}" aria-label="Изменить ${esc(t.title)}">⋮</button></div>`;
}
function render(){
  applyTheme();if(isProject()&&!state.projects.some(p=>p.id===screen))screen='';
  const tasks=visibleTasks(),pending=tasks.filter(t=>!t.done),done=tasks.filter(t=>t.done),r=M.rank(state.xp),dated=screen==='calendar';
  const title=screen==='history'?'Готово':dated?dateText(selectedDate):isProject()?state.projects.find(p=>p.id===screen).name:'Сегодня';
  $('dateLabel').textContent=dated?dateText(selectedDate,{weekday:'long',day:'numeric',month:'long',year:'numeric'}):new Date().toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'});
  $('screenTitle').innerHTML=esc(title)+'<span>.</span>';
  $('subtitle').textContent=screen==='history'?'Маленькие шаги, которые уже стали результатом.':dated?(selectedDate>M.day()?'Все дела этой даты появятся в «Сегодня», когда она наступит.':'Дела, запланированные на этот день.'):screen?'Большие замыслы начинаются с одного дела.':'Немного фокуса. Много маленьких шагов.';
  $('progressLabel').textContent=screen==='history'?`${done.length}`:`${done.length} / ${tasks.length}`;
  $('screenActions').classList.toggle('hidden',!isProject());$('progressLabel').classList.toggle('hidden',isProject());
  $('progressFill').style.width=tasks.length?`${done.length/tasks.length*100}%`:'0%';
  const emptyTitle=dated?'Свободный день':tasks.length?'На сегодня — всё':'Место для важного';
  const emptyNote=dated?'Добавьте дело на эту дату. Оно дождётся своего дня.':tasks.length?'Можно выдохнуть. Или сделать ещё один маленький шаг.':'Добавьте дело, с которого хочется начать.';
  $('tasks').innerHTML=screen==='history'?done.slice().reverse().map(taskHTML).join('')||empty('Пока чистый лист','Здесь останутся все выполненные дела.'):pending.map(taskHTML).join('')||empty(emptyTitle,emptyNote);
  $('addTask').classList.toggle('hidden',screen==='history');$('showDone').classList.toggle('hidden',!done.length||screen==='history');$('showDone').textContent=`${showCompleted?'⌃ Скрыть':'⌄ Выполнено'} · ${done.length}`;
  $('completed').classList.toggle('hidden',!showCompleted||screen==='history');$('completed').innerHTML=done.map(taskHTML).join('');
  $('poolSection').classList.toggle('hidden',!!screen);$('poolCount').textContent=state.pool.length||'';
  const next=state.lastRotation+state.intervalHours*M.HOUR;
  $('rotationNote').textContent=(state.auto?`Одна случайная доступная просьба каждые ${hours(state.intervalHours)}. ${state.pool.length?'Следующий автовыбор: '+exactTime(next)+'. ':''}`:'Автовыбор на паузе. ')+ 'Доступность не гарантирует выбор именно этой просьбы. Время указано по часам телефона.';
  $('pool').innerHTML=state.pool.length?state.pool.map(p=>`<div class="pool-item ${!p.enabled?'disabled':''}"><span class="pool-symbol">↝</span><button class="task-body" data-pool="${esc(p.id)}"><span class="task-title">${esc(p.title)}</span><span class="task-meta">${p.tags.map(id=>state.tags.find(t=>t.id===id)).filter(Boolean).map(t=>`<span class="chip">#${esc(t.name)} · КД ${cooldownText(t.hours)}</span>`).join('')}</span><span class="request-availability" data-availability="${esc(p.id)}">${availabilityHTML(p)}</span></button><button class="dot" data-pool="${esc(p.id)}" aria-label="Изменить ${esc(p.title)}">⋮</button></div>`).join(''):'<div class="pool-empty">То, о чём вас попросили. Запишите просьбу — она попадёт в дела на день и исчезнет из очереди, когда будет выполнена.</div>';
  $('pickNow').classList.toggle('hidden',!state.pool.length);$('level').textContent=r.index+1;$('footerRank').textContent=`${r.name} · ${state.xp} XP`;
}
function empty(title,text){return `<div class="empty"><span class="empty-icon">${title==='На сегодня — всё'?'✧':'◌'}</span><strong>${title}</strong><p>${text}</p></div>`;}
function sheet(title,html){$('dialogContent').innerHTML=`<div class="sheet"><div class="sheet-top"><h2>${esc(title)}</h2><button class="sheet-close" id="closeSheet" aria-label="Закрыть">×</button></div>${html}</div>`;if(!$('dialog').open)$('dialog').showModal();$('closeSheet').onclick=()=>$('dialog').close();}
function close(){ $('dialog').close(); }
function field(label,id,value='',type='text',attrs=''){return `<label class="field"><span>${label}</span><input id="${id}" type="${type}" value="${esc(value)}" ${attrs}></label>`;}
function error(text){$('formError').textContent=text;}
function taskForm(id){
  const t=state.tasks.find(t=>t.id===id),isNew=!t;
  const defaultDate=t?(M.isDated(t)?t.date:''):screen==='calendar'?selectedDate:isProject()?'':M.day();
  const projectId=t?t.project:isProject()?screen:'';
  let time='';if(t?.reminder){const d=new Date(t.reminder);time=M.day(t.reminder)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
  sheet(isNew?'Новое дело':'Ваше дело',`<form id="taskForm">${field('ЧТО ХОЧЕТСЯ СДЕЛАТЬ','taskTitle',t?.title||'','text','maxlength="300" required autocomplete="off" placeholder="Например, забрать посылку"')}${field('ДАТА · НЕОБЯЗАТЕЛЬНО','taskDate',defaultDate,'date','max="9999-12-31"')}<p class="help">В эту дату дело появится в «Сегодня». Дело проекта без даты останется только в проекте.</p>${field('НАПОМНИТЬ · НЕОБЯЗАТЕЛЬНО','taskTime',time,'datetime-local')}<p class="help">Напоминание сработает в выбранные дату и время. На телефоне разрешите уведомления и точные напоминания в настройках приложения.</p><label class="field"><span>ПРОЕКТ</span><select id="taskProject"><option value="">Без проекта</option>${state.projects.map(p=>`<option value="${esc(p.id)}" ${projectId===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><div class="inline-error" id="formError"></div><button type="submit" class="primary full">${isNew?'Добавить дело · +5 XP':'Сохранить'}</button></form>${!isNew?'<div class="sheet-actions"><button id="deleteTask" class="text-button danger">Удалить дело</button></div>':''}`);
  $('taskForm').onsubmit=e=>{
    e.preventDefault();
    const title=$('taskTitle').value.trim(),v=$('taskTime').value,reminder=v?new Date(v).getTime():0,project=$('taskProject').value,selected=$('taskDate').value;
    const date=selected||M.day(),scheduled=!!selected;
    if(!title)return error('Напишите название дела');
    if(selected&&!M.validDay(selected))return error('Выберите существующую дату');
    if(v&&(!Number.isFinite(reminder)||reminder<=Date.now())&&reminder!==t?.reminder)return error('Выберите время напоминания в будущем');
    if(reminder&&scheduled&&M.day(reminder)<date)return error('Напоминание не может быть раньше даты дела');
    const changed=t&&(title!==t.title||reminder!==t.reminder||project!==t.project||date!==t.date||scheduled!==!!t.scheduled);
    const editReward=!isNew&&t.editedDay!==M.day()&&changed?2:0;
    if(commit(()=>{
      if(isNew)state.tasks.push({id:M.uid(),title,project,date,scheduled,done:false,rewarded:false,source:'',reminder,notified:false});
      else{if(reminder!==t.reminder)t.notified=false;Object.assign(t,{title,project,date,scheduled,reminder});if(editReward)t.editedDay=M.day();}
    },isNew?5:editReward,isNew?(date>M.day()?'Дело запланировано':'Дело добавлено'):'Сохранено'))close();
  };
  if(t)$('deleteTask').onclick=()=>confirm('Удалить дело?',t.title,()=>commit(()=>{state.tasks=state.tasks.filter(x=>x.id!==id);},0,'Дело удалено'));
}
function poolForm(id){
  const p=state.pool.find(p=>p.id===id);let tags=new Set(p?.tags||[]),enabled=p?.enabled??true;
  sheet(p?'Просьба':'Не забыть просьбу',`<form id="poolForm">${field('НАЗВАНИЕ','poolTitle',p?.title||'','text','maxlength="300" required placeholder="Например, забрать книгу для друга"')}<p class="help">Собственный КД всегда 0. Задержку задают только теги; из нескольких действует самая длинная. Она отсчитывается от последнего добавления просьбы в дела. Новая просьба доступна сразу.</p><label class="field"><span>ТЕГИ И ИХ КД</span></label><div class="tag-options">${state.tags.map(t=>`<button type="button" class="tag-option ${tags.has(t.id)?'selected':''}" data-tag="${esc(t.id)}">#${esc(t.name)} · КД ${cooldownText(t.hours)}</button>`).join('')||'<span class="pool-note">Добавьте теги в Настройках → Теги и правила cooldown.</span>'}</div><div class="switch-row"><div>Участвует в выборе<small>Исключённая просьба остаётся в очереди.</small></div><button type="button" id="poolEnabled" class="switch ${enabled?'on':''}" role="switch" aria-checked="${enabled}" aria-label="Участвует в выборе"></button></div><div class="request-preview" id="poolPreview"></div><p class="help">Время доступности указано по часам телефона. Автовыбор проверяет очередь отдельно, через общий интервал, и выбирает одну случайную доступную просьбу.</p><div class="inline-error" id="formError"></div><button type="submit" class="primary full">${p?'Сохранить':'Добавить просьбу · +5 XP'}</button></form>${p?'<div class="sheet-actions"><button id="deletePool" class="text-button danger">Удалить просьбу</button></div>':''}`);
  const preview=()=>{if($('poolPreview'))$('poolPreview').innerHTML=availabilityHTML({...p,id:p?.id||'new-request',tags:[...tags],enabled,lastSelected:p?.lastSelected||0});};preview();
  const timer=setInterval(preview,1000);$('dialog').addEventListener('close',()=>clearInterval(timer),{once:true});
  document.querySelectorAll('[data-tag]').forEach(b=>b.onclick=()=>{tags.has(b.dataset.tag)?tags.delete(b.dataset.tag):tags.add(b.dataset.tag);b.classList.toggle('selected');preview();});
  $('poolEnabled').onclick=()=>{enabled=!enabled;$('poolEnabled').classList.toggle('on',enabled);$('poolEnabled').setAttribute('aria-checked',enabled);preview();};
  $('poolForm').onsubmit=e=>{e.preventDefault();const title=$('poolTitle').value.trim();if(!title)return error('Напишите название');
    const changed=p&&(p.title!==title||p.enabled!==enabled||JSON.stringify(p.tags)!==JSON.stringify([...tags]));const reward=p?(changed&&p.editedDay!==M.day()?2:0):5;
    if(commit(()=>{if(p){Object.assign(p,{title,cooldownHours:0,tags:[...tags],enabled});if(reward)p.editedDay=M.day();}else state.pool.push({id:M.uid(),title,cooldownHours:0,tags:[...tags],enabled,lastSelected:0});},reward,'Просьба сохранена'))close();};
  if(p)$('deletePool').onclick=()=>confirm('Удалить просьбу?',p.title+' Уже добавленные задачи останутся.',()=>commit(()=>{state.pool=state.pool.filter(x=>x.id!==id);},0,'Удалено'));
}
function confirm(title,text,action){sheet(title,`<p class="confirm-text">${esc(text)}</p><button id="confirmAction" class="primary full">Подтвердить</button><button id="cancelAction" class="text-button full">Отмена</button>`);$('confirmAction').onclick=()=>{action();close();};$('cancelAction').onclick=close;}
function closeNavigation(){$('navigation').close();}
function openDate(date){selectedDate=date;screen=date===M.day()?'':'calendar';showCompleted=false;render();closeNavigation();}
function menu(resetMonth=true){
  if(resetMonth){const anchor=screen==='calendar'?selectedDate:M.day();calendarMonth=new Date(anchor+'T12:00:00');calendarMonth.setDate(1);}
  close();
  const year=calendarMonth.getFullYear(),month=calendarMonth.getMonth(),counts=M.calendarCounts(state),selected=screen==='calendar'?selectedDate:!screen?M.day():null;
  const cells=M.calendarCells(year,month);
  $('navigationContent').innerHTML=`<div class="drawer-content"><div class="drawer-heading"><span class="eyebrow">ВАШ КАЛЕНДАРЬ</span><button class="sheet-close" id="closeNavigation" aria-label="Закрыть меню">×</button></div><div class="calendar-header"><button id="prevMonth" aria-label="Предыдущий месяц">‹</button><button id="currentMonth" aria-label="К текущему месяцу">${esc(calendarMonth.toLocaleDateString('ru-RU',{month:'long',year:'numeric'}))}</button><button id="nextMonth" aria-label="Следующий месяц">›</button></div><div class="calendar-weekdays" aria-hidden="true">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d=>`<span>${d}</span>`).join('')}</div><div class="calendar-grid" role="group" aria-label="Календарь задач">${cells.map(c=>`<button class="calendar-day ${c.inMonth?'':'outside'} ${c.date===M.day()?'today':''} ${c.date===selected?'selected':''}" data-date="${c.date}" data-count="${counts[c.date]||0}" aria-label="${esc(dateText(c.date,{day:'numeric',month:'long',year:'numeric'}))}, дел: ${counts[c.date]||0}" aria-pressed="${c.date===selected}"><span>${c.number}</span><span class="calendar-dots" aria-hidden="true">${counts[c.date]?'<i></i>'+((counts[c.date]||0)>1?'<i></i>':''):''}</span></button>`).join('')}</div><p class="calendar-legend"><i></i> Есть запланированные дела</p><button class="nav-item ${!screen?'active':''}" data-screen=""><span>◉</span><b>Сегодня</b><small>${M.todayTasks(state).filter(t=>!t.done).length}</small></button><div class="nav-label">ПРОЕКТЫ<button id="newProject" class="small icon" aria-label="Новый проект">＋</button></div>${state.projects.map(p=>`<button class="nav-item ${screen===p.id?'active':''}" data-screen="${esc(p.id)}"><span>▧</span><b>${esc(p.name)}</b><small>${state.tasks.filter(t=>t.project===p.id&&!t.done).length}</small></button>`).join('')||'<p class="help">Дайте своему замыслу отдельное место.</p>'}<div class="nav-label">ЕЩЁ</div><button class="nav-item" data-screen="history"><span>✓</span><b>Выполненные дела</b></button><button class="nav-item" id="menuRanks"><span>✦</span><b>Ваш путь</b><small>${state.xp} XP</small></button><button class="nav-item" id="menuSettings"><span>⚙︎</span><b>Настройки</b></button></div>`;
  if(!$('navigation').open)$('navigation').showModal();
  $('closeNavigation').onclick=closeNavigation;
  const moveMonth=delta=>{calendarMonth=new Date(year,month+delta,1,12);menu(false);};
  $('prevMonth').onclick=()=>moveMonth(-1);$('nextMonth').onclick=()=>moveMonth(1);$('currentMonth').onclick=()=>{calendarMonth=new Date();calendarMonth.setDate(1);menu(false);};
  document.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>openDate(b.dataset.date));
  document.querySelectorAll('[data-screen]').forEach(b=>b.onclick=()=>{screen=b.dataset.screen;showCompleted=false;render();closeNavigation();});
  $('newProject').onclick=()=>{closeNavigation();projectForm();};$('menuRanks').onclick=()=>{closeNavigation();ranks();};$('menuSettings').onclick=()=>{closeNavigation();settings();};
}
function projectForm(id){const p=state.projects.find(p=>p.id===id);sheet(p?'Настройки проекта':'Новый проект',`<form id="projectForm">${field('НАЗВАНИЕ ПРОЕКТА','projectName',p?.name||'','text','required maxlength="60" placeholder="Мой большой замысел"')}<div class="inline-error" id="formError"></div><button class="primary full" type="submit">${p?'Сохранить':'Создать проект · +5 XP'}</button></form>${p?'<button class="text-button danger full" id="deleteProject">Удалить проект и его задачи</button>':''}`);$('projectForm').onsubmit=e=>{e.preventDefault();const name=$('projectName').value.trim();if(!name)return error('Напишите название');commit(()=>{if(p)p.name=name;else {const project={id:M.uid(),name};state.projects.push(project);screen=project.id;}},p?0:5,'Проект сохранён');close();};if(p)$('deleteProject').onclick=()=>confirm('Удалить проект?',`«${p.name}» и все его задачи будут удалены.`,()=>commit(()=>{state.projects=state.projects.filter(x=>x.id!==id);state.tasks=state.tasks.filter(t=>t.project!==id);screen='';},0,'Проект удалён'));}
function permissions(){return native?JSON.parse(Android.permissions()):{notifications:false,exact:false};}
function downloadBackup(json){if(native)Android.shareBackup(json);else{const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='my-todo-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}}
function settings(){const perms=permissions();sheet('Настройки',`<div class="eyebrow">ЦВЕТОВАЯ ТЕМА</div><div class="theme-grid">${Object.entries(themes).map(([id,t])=>`<button class="theme-card ${state.theme===id?'active':''}" data-theme="${id}"><div class="theme-swatches"><i style="background:${t.bg}"></i><i style="background:${t.panel}"></i><i style="background:${t.accent}"></i></div>${t.name}</button>`).join('')}</div><div class="settings-title">ОЧЕРЕДЬ ПРОСЬБ</div><div class="switch-row"><div>Автоматический выбор<small>Одна случайная доступная просьба за интервал.</small></div><button id="autoToggle" class="switch ${state.auto?'on':''}" role="switch" aria-label="Автоматический выбор" aria-checked="${state.auto}"></button></div><div class="row">${field('ИНТЕРВАЛ ВЫБОРА, ЧАСЫ','intervalHours',state.intervalHours,'number','min="0.25" max="8760" step="0.25"')}<button id="saveInterval" class="secondary">Применить</button></div><p class="help">Интервал задаёт частоту случайного автовыбора. КД задаётся только тегами и считается от последнего добавления просьбы в дела. Без тегов задержки нет. Доступность просьбы не гарантирует, что следующим автовыбором будет выбрана именно она. Во время сна телефона автовыбор может задержаться; пропущенные интервалы не накапливаются.</p><button id="tagsSettings" class="settings-item"><span>Теги и правила cooldown</span><small>${state.tags.length} →</small></button><div class="settings-title">НАПОМИНАНИЯ</div><button id="notificationPermission" class="settings-item"><span>Уведомления</span><small>${perms.notifications?'Разрешены ✓':'Разрешить →'}</small></button><button id="exactPermission" class="settings-item"><span>Точное время напоминаний</span><small>${perms.exact?'Разрешено ✓':'Разрешить →'}</small></button><p class="help">На OnePlus: Настройки телефона → Приложения → My TODO → Использование батареи → разрешите фоновую работу. Иначе OxygenOS может задерживать напоминания и автовыбор. После принудительной остановки откройте приложение снова.</p><div class="settings-title">ВАШИ ДАННЫЕ</div><button id="exportData" class="settings-item"><span>Сохранить резервную копию</span><small>JSON ↗</small></button><button id="importData" class="settings-item"><span>Восстановить из файла</span><small>JSON ↙</small></button>${backupSource('beforeMigration')?'<button id="exportMigration" class="settings-item"><span>Копия до обновления</span><small>JSON ↗</small></button>':''}${backupSource('beforeImport')?'<button id="exportBeforeImport" class="settings-item"><span>Копия до восстановления</span><small>JSON ↗</small></button>':''}<p class="help">Перед обновлением формата и восстановлением приложение автоматически сохраняет локальную копию прежних данных. Данные хранятся только на устройстве. Обновление APK сохраняет их. Перед удалением приложения сохраните резервную копию.</p><p class="version">My TODO · 1.3.0<br>Место для важного.</p>`);
  document.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>{commit(()=>state.theme=b.dataset.theme);settings();});
  $('autoToggle').onclick=()=>{commit(()=>{state.auto=!state.auto;if(state.auto)state.lastRotation=Date.now();});settings();};
  $('saveInterval').onclick=()=>{const h=Number($('intervalHours').value);if(!Number.isFinite(h)||h<.25||h>8760)return toast('Интервал от 0,25 до 8760 часов');commit(()=>{state.intervalHours=h;state.lastRotation=Date.now();},0,'Интервал сохранён');};
  $('tagsSettings').onclick=tagSettings;$('notificationPermission').onclick=()=>native?Android.requestNotifications():toast('Доступно в Android-приложении');$('exactPermission').onclick=()=>native?Android.requestExact():toast('Доступно в Android-приложении');
  $('exportData').onclick=()=>downloadBackup(JSON.stringify(state,null,2));
  if($('exportMigration'))$('exportMigration').onclick=()=>downloadBackup(backupSource('beforeMigration'));
  if($('exportBeforeImport'))$('exportBeforeImport').onclick=()=>downloadBackup(backupSource('beforeImport'));
  $('importData').onclick=()=>native?Android.importBackup():$('importFile').click();
}
function tagSettings(){sheet('Теги и правила',`<p class="help">Задавайте разный cooldown для разных типов дел. Теги и исключение из выбора видны прямо в очереди просьб.</p>${state.tags.map(t=>`<div class="tag-row"><b>#${esc(t.name)}</b><small>${hours(t.hours)}</small><button data-edit-tag="${esc(t.id)}" aria-label="Изменить ${esc(t.name)}">✎</button><button data-delete-tag="${esc(t.id)}" aria-label="Удалить ${esc(t.name)}">×</button></div>`).join('')||'<p class="pool-empty">Например: #дом — 72 часа, #здоровье — 24 часа.</p>'}<button id="addTag" class="primary full">Создать тег</button>`);$('addTag').onclick=()=>tagForm();document.querySelectorAll('[data-edit-tag]').forEach(b=>b.onclick=()=>tagForm(b.dataset.editTag));document.querySelectorAll('[data-delete-tag]').forEach(b=>b.onclick=()=>{const id=b.dataset.deleteTag;commit(()=>{state.tags=state.tags.filter(t=>t.id!==id);state.pool.forEach(p=>p.tags=p.tags.filter(t=>t!==id));});tagSettings();});}
function tagForm(id){const t=state.tags.find(t=>t.id===id);sheet(t?'Изменить тег':'Новый тег',`<form id="tagForm">${field('НАЗВАНИЕ БЕЗ #','tagName',t?.name||'','text','required maxlength="60" placeholder="здоровье"')}${field('COOLDOWN, ЧАСЫ','tagHours',t?.hours??24,'number','min="0" max="87600" step="0.25" required')}<div id="formError" class="inline-error"></div><button type="submit" class="primary full">Сохранить тег</button></form>`);$('tagForm').onsubmit=e=>{e.preventDefault();const name=$('tagName').value.trim().replace(/^#+/,'').trim(),h=Number($('tagHours').value);if(!name)return error('Напишите название тега');if(state.tags.some(x=>x.id!==id&&x.name.toLowerCase()===name.toLowerCase()))return error('Такой тег уже есть');if(!Number.isFinite(h)||h<0||h>87600)return error('Cooldown от 0 до 87600 часов');commit(()=>{if(t)Object.assign(t,{name,hours:h});else state.tags.push({id:M.uid(),name,hours:h});},0,'Тег сохранён');tagSettings();};}
function ranks(){const r=M.rank(state.xp),pct=r.next?(state.xp-r.start)/(r.next-r.start)*100:100;sheet('Ваш путь',`<div class="rank-hero"><div class="rank-star">✦</div><h2>${r.name}</h2><p>Ранг ${r.index+1} из ${M.rankNames.length} · ${state.xp} XP</p><div class="xp-track"><div style="width:${pct}%"></div></div><p>${r.next?`${r.next-state.xp} XP до ранга «${M.rankNames[r.index+1]}»`:'Все ранги открыты. Ваш путь продолжается.'}</p></div><p class="help">Выполнение дела +20 XP · добавление дела или проекта +5 XP · изменение дела +2 XP (один раз в день для каждого дела). Повторная отметка выполнения не приносит опыт.</p><div>${M.rankNames.map((n,i)=>`<div class="rank-row ${i===r.index?'current':i>r.index?'locked':''}"><span>${String(i+1).padStart(2,'0')}</span>${n}<small>${i<r.index?'✓':M.threshold(i)+' XP'}</small></div>`).join('')}</div>`);}
window.receiveBackup=raw=>{let imported;try{imported=M.validate(JSON.parse(raw));}catch(e){return toast(e.message||'Некорректный файл');}confirm('Восстановить данные?',`Будет загружено ${imported.tasks.length} задач и ${imported.pool.length} просьб. Их списки, проекты и даты сохранятся. Копия текущих данных будет автоматически сохранена в настройках.`,()=>commit(()=>{const revision=state.revision;state=M.prepareImport(imported);state.revision=revision;screen='';},0,'Данные восстановлены',true));};
$('importFile').onchange=async e=>{const f=e.target.files[0];if(f){if(f.size>2000000)toast('Файл слишком большой');else receiveBackup(await f.text());}e.target.value='';};
$('menu').onclick=menu;$('settingsShortcut').onclick=settings;$('rankButton').onclick=ranks;$('addTask').onclick=()=>taskForm();$('addPool').onclick=()=>poolForm();$('screenActions').onclick=()=>projectForm(screen);$('showDone').onclick=()=>{showCompleted=!showCompleted;render();};
$('pickNow').onclick=()=>{if(!state.pool.some(p=>M.eligible(state,p)))return toast('Нет доступных просьб: проверьте cooldown и исключения');commit(()=>M.select(state),0,'Просьба добавлена на сегодня');};
document.addEventListener('click',e=>{const b=e.target.closest('[data-complete],[data-edit],[data-pool]');if(!b)return;if(b.dataset.complete){const oldRank=M.rank(state.xp).index;let earned=0;commit(()=>{earned=M.complete(state,b.dataset.complete);},0);if(earned)toast(M.rank(state.xp).index>oldRank?`Новый ранг: ${M.rank(state.xp).name} · +20 XP`:'+20 XP · Маленький шаг сделан');}else if(b.dataset.edit)taskForm(b.dataset.edit);else poolForm(b.dataset.pool);});
for(const modal of [$('dialog'),$('navigation')])modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)modal.close();}});
window.handleBack=()=>{if($('navigation').open)closeNavigation();else if($('dialog').open)close();else if(screen){screen='';render();}else if(native)Android.close();};
window.refreshNative=()=>{if(!state||$('dialog').open||$('navigation').open)return;try{state=read();render();}catch(e){}};
state=read();if(!native){M.reconcile(state);persist();}render();
setInterval(()=>{if($('dialog').open||$('navigation').open)return;if(native)refreshNative();else{M.reconcile(state);persist();render();}},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(native)refreshNative();else{M.reconcile(state);persist();render();}}});

setInterval(refreshAvailability,1000);
