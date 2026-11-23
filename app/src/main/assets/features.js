'use strict';
// The deadline curtain and project graph share the app's offline state and backup.
let deadlineMonth=new Date(),deadlineSelected='',graphLinkFrom='',deferGraphRender=false;
const deadlineCurtain=$('deadlineCurtain'),graphDialog=$('graphDialog');
function deadlineCard(event){
  const due=event.deadline?exactTime(event.deadline):'',description=event.description||'';
  return `<button class="deadline-card" data-event="${esc(event.id)}"><span class="deadline-card-title">${esc(event.title)}</span>${due?`<span class="deadline-card-due">◷ ${esc(due)}</span>`:''}${description?`<span class="deadline-card-description">${esc(description)}</span>`:''}</button>`;
}
function renderDeadlineCurtain(){
  if(!deadlineCurtain.classList.contains('open'))return;
  const oldScroll=deadlineCurtain.scrollTop,year=deadlineMonth.getFullYear(),month=deadlineMonth.getMonth(),counts=M.eventCounts(state),cells=M.calendarCells(year,month);
  const onDay=deadlineSelected?state.events.filter(e=>M.eventDate(e)===deadlineSelected):[];
  const unscheduled=state.events.filter(e=>!e.date).sort((a,b)=>(a.deadline||Infinity)-(b.deadline||Infinity));
  $('deadlineContent').innerHTML=`<div class="deadline-content"><div class="deadline-top"><div><span class="eyebrow">ВСЁ ПЕРЕД ГЛАЗАМИ</span><h2>События<span>.</span></h2></div><div class="deadline-top-actions"><button id="deadlineAdd" class="icon small" aria-label="Добавить событие">＋</button><button id="deadlineClose" class="sheet-close" aria-label="Закрыть события">×</button></div></div><div class="calendar-header"><button id="deadlinePrev" aria-label="Предыдущий месяц событий">‹</button><button id="deadlineCurrent" aria-label="К текущему месяцу событий">${esc(deadlineMonth.toLocaleDateString('ru-RU',{month:'long',year:'numeric'}))}</button><button id="deadlineNext" aria-label="Следующий месяц событий">›</button></div><div class="calendar-weekdays" aria-hidden="true">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d=>`<span>${d}</span>`).join('')}</div><div class="calendar-grid deadline-grid" role="group" aria-label="Календарь событий">${cells.map(c=>{const n=counts[c.date]||0;return `<button class="calendar-day ${c.inMonth?'':'outside'} ${c.date===M.day()?'today':''} ${c.date===deadlineSelected?'selected':''}" data-event-date="${c.date}" aria-label="${esc(dateText(c.date,{day:'numeric',month:'long',year:'numeric'}))}, событий: ${n}" aria-pressed="${c.date===deadlineSelected}"><span>${c.number}</span><span class="deadline-dots" aria-hidden="true">${n>3?'<i class="large"></i>':Array.from({length:n},()=>'<i></i>').join('')}</span></button>`;}).join('')}</div>${deadlineSelected?`<section class="deadline-day-panel" id="deadlineDayPanel"><div class="deadline-section-title"><h3>${esc(dateText(deadlineSelected,{day:'numeric',month:'long',year:'numeric'}))}</h3><button id="deadlineDayClose" class="sheet-close" aria-label="Свернуть события дня">×</button></div>${onDay.map(deadlineCard).join('')||'<p class="deadline-empty">На этот день событий нет.</p>'}</section>`:''}<section class="deadline-unscheduled"><div class="deadline-section-title"><h3>Без назначенного дня</h3><span>${unscheduled.length}</span></div>${unscheduled.map(deadlineCard).join('')||'<p class="deadline-empty">Пока ничего нет. Добавьте идею или дело, которое важно помнить.</p>'}</section></div>`;
  deadlineCurtain.scrollTop=oldScroll;
  $('deadlineClose').onclick=closeDeadlineCurtain;
  $('deadlineAdd').onclick=()=>eventForm('',deadlineSelected);
  const changeMonth=step=>{deadlineMonth=new Date(year,month+step,1,12);renderDeadlineCurtain();};
  $('deadlinePrev').onclick=()=>changeMonth(-1);$('deadlineNext').onclick=()=>changeMonth(1);
  $('deadlineCurrent').onclick=()=>{deadlineMonth=new Date();deadlineMonth.setDate(1);renderDeadlineCurtain();};
  document.querySelectorAll('[data-event-date]').forEach(b=>b.onclick=()=>{deadlineSelected=b.dataset.eventDate;renderDeadlineCurtain();$('deadlineDayPanel')?.scrollIntoView({block:'nearest',behavior:'smooth'});});
  if($('deadlineDayClose'))$('deadlineDayClose').onclick=()=>{deadlineSelected='';renderDeadlineCurtain();};
  $('deadlineContent').querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>eventDetails(b.dataset.event));
}
function openDeadlineCurtain(){
  if(screen||deadlineCurtain.classList.contains('open'))return;
  deadlineMonth=new Date();deadlineMonth.setDate(1);deadlineSelected='';
  deadlineCurtain.classList.add('open');deadlineCurtain.setAttribute('aria-hidden','false');document.body.classList.add('deadline-open');renderDeadlineCurtain();deadlineCurtain.scrollTop=0;
}
function closeDeadlineCurtain(){deadlineCurtain.classList.remove('open');deadlineCurtain.setAttribute('aria-hidden','true');document.body.classList.remove('deadline-open');}
function localDateTime(ts){if(!ts)return '';const d=new Date(ts);return M.day(ts)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
function eventForm(id='',dateHint=''){
  const event=state.events.find(e=>e.id===id),lead=event?.remindBeforeHours||0,unit=lead>=24&&lead%24===0?'days':'hours';
  sheet(event?'Изменить событие':'Новое событие',`<form id="eventForm">${field('НАЗВАНИЕ','eventTitle',event?.title||'','text','maxlength="300" required placeholder="Что важно помнить"')}<label class="field"><span>ОПИСАНИЕ · НЕОБЯЗАТЕЛЬНО</span><textarea id="eventDescription" maxlength="5000" rows="4" placeholder="Подробности">${esc(event?.description||'')}</textarea></label>${field('ДЕНЬ В КАЛЕНДАРЕ · НЕОБЯЗАТЕЛЬНО','eventDate',event?.date||dateHint,'date','max="9999-12-31"')}${field('ДЕДЛАЙН · НЕОБЯЗАТЕЛЬНО','eventDeadline',localDateTime(event?.deadline),'datetime-local')}<div class="row event-reminder"><label class="field"><span>НАПОМНИТЬ ЗА</span><input id="eventLead" type="number" min="0" max="87600" step="0.25" value="${lead/(unit==='days'?24:1)}"></label><label class="field"><span>ЕДИНИЦА</span><select id="eventLeadUnit"><option value="hours" ${unit==='hours'?'selected':''}>часов</option><option value="days" ${unit==='days'?'selected':''}>дней</option></select></label></div><p class="help">Если дедлайн не указан, напоминание придёт в 09:00 дня в календаре. Без обеих дат событие останется в списке без напоминания.</p><div id="formError" class="inline-error"></div><button class="primary full" type="submit">${event?'Сохранить':'Добавить событие'}</button></form>`);
  $('eventForm').onsubmit=e=>{
    e.preventDefault();const title=$('eventTitle').value.trim(),description=$('eventDescription').value.trim(),date=$('eventDate').value,raw=$('eventDeadline').value,deadline=raw?new Date(raw).getTime():0,lead=Number($('eventLead').value)*($('eventLeadUnit').value==='days'?24:1);
    if(!title)return error('Напишите название');if(date&&!M.validDay(date))return error('Выберите существующую дату');
    if(raw&&(!Number.isSafeInteger(deadline)||deadline<0))return error('Укажите корректный дедлайн');
    if(!Number.isFinite(lead)||lead<0||lead>87600)return error('Укажите интервал от 0 до 87600 часов');
    const entry={id:event?.id||M.uid(),title,description,date,deadline,remindBeforeHours:lead,notified:false};
    const reminderAt=M.eventReminderAt(entry);entry.notified=reminderAt>0&&reminderAt<=Date.now();
    if(event&&event.date===date&&event.deadline===deadline&&event.remindBeforeHours===lead)entry.notified=event.notified;
    if(commit(()=>{if(event)Object.assign(event,entry);else state.events.push(entry);},0,event?'Событие сохранено':'Событие добавлено'))close();
  };
}
function eventDetails(id){
  const event=state.events.find(e=>e.id===id);if(!event)return;
  const date=M.eventDate(event),lead=event.remindBeforeHours;
  sheet(event.title,`<div class="event-details">${event.description?`<p>${esc(event.description)}</p>`:'<p class="help">Без описания</p>'}${date?`<div>В календаре: ${esc(dateText(date,{day:'numeric',month:'long',year:'numeric'}))}</div>`:''}${event.deadline?`<div>Дедлайн: ${esc(exactTime(event.deadline))}</div>`:''}${date||event.deadline?`<div>Напомнить за ${lead>=24&&lead%24===0?lead/24+' д':lead+' ч'}</div>`:''}</div><div class="sheet-actions"><button id="eventEdit" class="secondary">Изменить</button><button id="eventDelete" class="text-button danger">Удалить</button></div>`);
  $('eventEdit').onclick=()=>eventForm(id);$('eventDelete').onclick=()=>confirm('Удалить событие?',event.title,()=>commit(()=>{state.events=state.events.filter(e=>e.id!==id);},0,'Событие удалено'));
}
function graphNodeHTML(node,position){
  const count=node.taskIds.filter(id=>state.tasks.some(t=>t.id===id)||state.pool.some(p=>p.taskBackup?.id===id)).length;
  const width=Math.min(190,Math.max(128,55+Array.from(node.text).length*7));
  return `<div class="graph-node ${graphLinkFrom===node.id?'link-source':''}" data-graph-node="${esc(node.id)}" style="left:${position.x}px;top:${position.y}px;width:${width}px"><textarea class="graph-node-text" data-node-text="${esc(node.id)}" aria-label="Текст вершины" maxlength="120" rows="2">${esc(node.text)}</textarea><div class="graph-node-actions"><button data-child="${esc(node.id)}" aria-label="Новая ветвь от ${esc(node.text)}" title="Новая ветвь">↑</button><button data-node-tasks="${esc(node.id)}" aria-label="Дела вершины ${esc(node.text)}" title="Прикрепить дело">≡${count?` ${count}`:''}</button><button data-link="${esc(node.id)}" aria-label="Соединить вершину ${esc(node.text)}" title="Соединить вершины">＋</button></div></div>`;
}
function renderGraph(resetCamera=false){
  if(!graphDialog.open)return;
  if(!isProject()){graphDialog.close();return;}
  const oldScroll=$('graphScroll'),oldTop=oldScroll?.scrollTop,oldLeft=oldScroll?.scrollLeft;
  const graph=M.graphFor(state,screen)||{project:screen,nodes:[],edges:[]},layout=M.graphLayout(graph,Math.max(340,graphDialog.clientWidth),Math.max(590,graphDialog.clientHeight-145));
  const curves=graph.edges.map(edge=>{const a=layout.positions[edge.from],b=layout.positions[edge.to];if(!a||!b)return '';const y1=a.y-38,y2=b.y+38,span=Math.max(40,(y1-y2)*.48);return `<path d="M ${a.x} ${y1} C ${a.x} ${y1-span}, ${b.x} ${y2+span}, ${b.x} ${y2}"/>`;}).join('');
  $('graphContent').innerHTML=`<div class="graph-top"><div><span class="eyebrow">${esc(state.projects.find(p=>p.id===screen)?.name||'ПРОЕКТ')}</span><h2>Граф идей<span>.</span></h2></div><button id="graphClose" class="sheet-close" aria-label="Закрыть граф">×</button></div><div id="graphScroll" class="graph-scroll"><div class="graph-canvas" style="width:${layout.width}px;height:${layout.height}px"><svg class="graph-edges" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" aria-hidden="true"><defs><marker id="graphArrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M 0 0 L 7 3.5 L 0 7"/></marker></defs>${curves}</svg>${graph.nodes.map(n=>graphNodeHTML(n,layout.positions[n.id])).join('')}${!graph.nodes.length?'<p class="graph-empty">Начните с первой идеи. Новые ветви будут расти вверх.</p>':''}</div></div><div class="graph-toolbar">${graphLinkFrom?'<span class="graph-link-hint">Нажмите ＋ у верхней вершины, чтобы связать её</span>':''}<button id="graphAdd" class="primary">${graph.nodes.length?'＋ Новая ветвь':'＋ Первая вершина'}</button></div>`;
  const scroll=$('graphScroll');scroll.scrollTop=resetCamera||oldTop===undefined?scroll.scrollHeight-scroll.clientHeight:oldTop;scroll.scrollLeft=resetCamera||oldLeft===undefined?(scroll.scrollWidth-scroll.clientWidth)/2:oldLeft;
  $('graphClose').onclick=()=>graphDialog.close();$('graphAdd').onclick=()=>graphNodeForm();
  $('graphContent').querySelectorAll('[data-child]').forEach(b=>b.onclick=()=>graphNodeForm(b.dataset.child));
  $('graphContent').querySelectorAll('[data-node-tasks]').forEach(b=>b.onclick=()=>graphNodeTasks(b.dataset.nodeTasks));
  $('graphContent').querySelectorAll('[data-link]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.link;if(!graphLinkFrom||graphLinkFrom===id){graphLinkFrom=graphLinkFrom===id?'':id;renderGraph();return;}
    const from=graphLinkFrom;graphLinkFrom='';if(!commit(()=>M.addGraphEdge(state,screen,from,id),0,'Вершины соединены'))renderGraph();
  });
  $('graphContent').querySelectorAll('[data-node-text]').forEach(input=>input.onchange=()=>{
    const node=graph.nodes.find(n=>n.id===input.dataset.nodeText),value=input.value.trim();
    if(!node)return;if(!value){input.value=node.text;return toast('Текст вершины не может быть пустым');}
    if(value!==node.text){deferGraphRender=true;commit(()=>{node.text=value;},0,'Идея сохранена');deferGraphRender=false;}
  });
}
function openGraph(){if(!isProject())return;graphLinkFrom='';graphDialog.showModal();renderGraph(true);}
function graphNodeForm(parentId=''){
  const graph=M.graphFor(state,screen),nodes=graph?.nodes||[];
  sheet(nodes.length?'Новая ветвь':'Первая вершина',`<form id="graphNodeForm">${field('ИДЕЯ','graphNodeTitle','','text','maxlength="120" required placeholder="Напишите идею"')}${nodes.length?`<label class="field"><span>ОТ КАКОЙ ВЕРШИНЫ</span><select id="graphParent">${nodes.map(n=>`<option value="${esc(n.id)}" ${n.id===parentId?'selected':''}>${esc(n.text)}</option>`).join('')}</select></label>`:''}<div id="formError" class="inline-error"></div><button class="primary full" type="submit">Создать вершину</button></form>`);
  $('graphNodeForm').onsubmit=e=>{e.preventDefault();const text=$('graphNodeTitle').value.trim(),parent=$('graphParent')?.value||'';if(!text)return error('Напишите идею');if(commit(()=>M.addGraphNode(state,screen,text,parent),0,'Вершина создана'))close();};
}
function graphNodeTasks(nodeId){
  const graph=M.graphFor(state,screen),node=graph?.nodes.find(n=>n.id===nodeId);if(!node)return;
  const attached=node.taskIds.map(id=>{const active=state.tasks.find(t=>t.id===id),request=active?null:state.pool.find(p=>p.taskBackup?.id===id);return {task:active||request?.taskBackup,request};}).filter(x=>x.task),available=state.tasks.filter(t=>t.project===screen&&!node.taskIds.includes(t.id));
  sheet('Дела идеи',`<p class="confirm-text">${esc(node.text)}</p><div class="node-task-list">${attached.map(({task,request})=>`<div><button ${request?`data-open-request="${esc(request.id)}"`:`data-open-task="${esc(task.id)}"`}>${esc(task.title)}${request?' · в просьбах':''}</button><button data-detach-task="${esc(task.id)}" aria-label="Открепить ${esc(task.title)}">×</button></div>`).join('')||'<p class="help">Прикреплённых дел пока нет.</p>'}</div>${available.length?`<div class="row"><label class="field"><span>СУЩЕСТВУЮЩЕЕ ДЕЛО</span><select id="graphExistingTask">${available.map(t=>`<option value="${esc(t.id)}">${esc(t.title)}</option>`).join('')}</select></label><button id="graphAttach" class="secondary">Прикрепить</button></div>`:''}<button id="graphNewTask" class="primary full">＋ Создать дело</button><button id="graphDeleteNode" class="text-button danger full">Удалить вершину</button>`);
  $('graphNewTask').onclick=()=>taskForm('',nodeId);
  if($('graphAttach'))$('graphAttach').onclick=()=>{const taskId=$('graphExistingTask').value;if(commit(()=>M.attachGraphTask(state,screen,nodeId,taskId),0,'Дело прикреплено'))graphNodeTasks(nodeId);};
  document.querySelectorAll('[data-detach-task]').forEach(b=>b.onclick=()=>{if(commit(()=>{node.taskIds=node.taskIds.filter(id=>id!==b.dataset.detachTask);},0,'Дело откреплено'))graphNodeTasks(nodeId);});
  document.querySelectorAll('[data-open-task]').forEach(b=>b.onclick=()=>taskForm(b.dataset.openTask));
  document.querySelectorAll('[data-open-request]').forEach(b=>b.onclick=()=>scheduleForm(b.dataset.openRequest));
  $('graphDeleteNode').onclick=()=>confirm('Удалить вершину?',`«${node.text}». Прикреплённые дела останутся в проекте.`,()=>commit(()=>{graph.nodes=graph.nodes.filter(n=>n.id!==nodeId);graph.edges=graph.edges.filter(e=>e.from!==nodeId&&e.to!==nodeId);graphLinkFrom='';},0,'Вершина удалена'));
}
window.refreshFeatureOverlays=()=>{renderDeadlineCurtain();if(graphDialog.open&&!deferGraphRender&&!document.activeElement?.classList.contains('graph-node-text'))renderGraph();};
window.closeFeatureOverlay=()=>{if(graphDialog.open){graphDialog.close();return true;}if(deadlineCurtain.classList.contains('open')){closeDeadlineCurtain();return true;}return false;};
$('deadlinePull').onclick=openDeadlineCurtain;$('graphMode').onclick=openGraph;
graphDialog.addEventListener('close',()=>{graphLinkFrom='';});
let pullStart=null;
document.addEventListener('pointerdown',e=>{if(screen||deadlineCurtain.classList.contains('open')||$('dialog').open||$('navigation').open||window.scrollY>2||e.clientY>180)return;pullStart={x:e.clientX,y:e.clientY};});
document.addEventListener('pointerup',e=>{if(!pullStart)return;const dx=e.clientX-pullStart.x,dy=e.clientY-pullStart.y;pullStart=null;if(dy>60&&Math.abs(dx)<80)openDeadlineCurtain();});
document.addEventListener('pointercancel',()=>{pullStart=null;});
