(function(root) {
  'use strict';
  const HOUR = 3600000;
  const rankNames = ['Первый шаг','Искра','Росток','Наблюдатель','Искатель','Ученик','Практик','Следопыт','Собиратель','Проводник','Ремесленник','Созидатель','Навигатор','Знаток','Стратег','Хранитель ритма','Исследователь','Архитектор дня','Мастер привычек','Алхимик','Покоритель вершин','Капитан','Виртуоз','Наставник','Хранитель времени','Мастер фокуса','Первооткрыватель','Маэстро','Зодчий','Мудрец','Вдохновитель','Повелитель ритма','Картограф','Хранитель баланса','Грандмастер','Покоритель горизонтов','Творец порядка','Светоч','Пилигрим','Хранитель огня','Архитектор перемен','Астральный странник','Мастер пути','Проводник света','Созвездие','Хранитель рассвета','Творец миров','Повелитель времени','Легенда','Северная звезда','Оракул','Хранитель вселенной','Бесконечный горизонт','Источник вдохновения','Вечный двигатель','Сверхновая','Космический архитектор','Мастер бесконечности','За гранью возможного','Абсолют'];
  const uid = () => (root.crypto?.randomUUID?.() || Date.now().toString(36)+Math.random().toString(36).slice(2));
  const day = (ts=Date.now()) => { const d=new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const initial = () => ({schema:3,queueClockStartedAt:Date.now(),tagCooldownVersion:1,tagLastSelected:{},untaggedLastSelected:0,tasks:[],pool:[],tags:[],projects:[],events:[],graphs:[],xp:0,theme:'sage',intervalHours:8,auto:true,lastRotation:0,overdueCheckDay:day()});
  function validDay(value) {
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d=new Date(value+'T12:00:00');
    return Number.isFinite(d.getTime())&&day(d.getTime())===value;
  }
  function addDays(date,amount) {
    const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+amount);const result=day(d.getTime());
    if(!validDay(result))throw Error('Дата следующего повтора выходит за допустимый диапазон');return result;
  }
  function normalizeCooldowns(s) {
    const pending=[...s.pool,...s.tasks.map(t=>t.requestBackup).filter(Boolean)],seen=new Set();
    while(pending.length){const p=pending.pop();if(seen.has(p))continue;seen.add(p);p.cooldownHours=0;if(p.taskBackup?.requestBackup)pending.push(p.taskBackup.requestBackup);}
  }
  function migrate(s,now=Date.now()) {
    if(s.schema<3||s.queueClockStartedAt===undefined){s.schema=3;s.overdueCheckDay=day(now);s.lastRotation=now;if(s.queueClockStartedAt===undefined)s.queueClockStartedAt=now;}
    normalizeCooldowns(s);
    if(s.events===undefined)s.events=[];
    if(s.graphs===undefined)s.graphs=[];
    if(s.tagCooldownVersion!==1){
      s.tagLastSelected={};s.untaggedLastSelected=0;
      for(const p of [...s.pool,...s.tasks.map(t=>t.requestBackup).filter(Boolean)]){
        const assigned=p.tags.filter(id=>s.tags.some(t=>t.id===id));
        if(assigned.length)for(const id of assigned)s.tagLastSelected={...s.tagLastSelected,[id]:Math.max(Object.hasOwn(s.tagLastSelected,id)?s.tagLastSelected[id]:0,p.lastSelected||0)};
        else s.untaggedLastSelected=Math.max(s.untaggedLastSelected,p.lastSelected||0);
      }
      s.tagCooldownVersion=1;
    }
    return s;
  }
  function prepareImport(s,now=Date.now()){validate(s,now);s.overdueCheckDay=day(now);s.lastRotation=now;return s;}
  function isDated(t) { return !t.project||t.scheduled===true; }
  function isOverdueRequest(s,p) {
    return !!p.overdueDate||!!p.taskBackup?.overdueDate||p.tags.some(id=>s.tags.some(t=>t.id===id&&t.name.trim().toLowerCase()==='просроченные'));
  }
  function wasOriginalRequest(s,t) {
    if(typeof t.requestOrigin==='boolean')return t.requestOrigin;
    if(!t.source)return false;
    const p=s.pool.find(p=>p.id===t.source)||t.requestBackup;
    return !!p&&(typeof p.requestOrigin==='boolean'?p.requestOrigin:!p.taskBackup||!!p.taskBackup.source);
  }
  function taskOverdueDate(s,t,today=day()) {
    const origin=s.pool.find(p=>p.id===t.source)||t.requestBackup;
    return t.overdueDate||origin?.overdueDate||origin?.taskBackup?.overdueDate||(origin&&isOverdueRequest(s,origin)?origin.taskBackup?.date||(origin.lastSelected?day(origin.lastSelected):today):'')||(!t.done&&isDated(t)&&t.date<today?t.date:'');
  }
  function queueTask(s,t,overdueDate,resetSelection=false,now=Date.now()) {
    let p=s.pool.find(p=>p.id===t.source&&(!p.taskBackup||p.taskBackup.id===t.id));
    if(!p){
      const original=t.requestBackup;
      p=original&&!s.pool.some(p=>p.id===original.id)?JSON.parse(JSON.stringify(original)):{id:uid(),title:t.title,tags:[],cooldownHours:0,enabled:true,lastSelected:0};
      s.pool.push(p);
    }
    p.requestOrigin=wasOriginalRequest(s,t);
    const backup=JSON.parse(JSON.stringify(t));delete backup.requestBackup;delete backup.manualRequest;
    p.title=t.title;p.taskBackup=backup;p.cooldownHours=0;p.queuedAt=now;
    if(overdueDate){
      let tag=s.tags.find(t=>t.name.trim().toLowerCase()==='просроченные');
      if(!tag){tag={id:uid(),name:'просроченные',hours:0};s.tags.push(tag);}
      p.overdueDate=overdueDate;backup.overdueDate=overdueDate;p.enabled=false;
      if(!p.tags.includes(tag.id))p.tags.push(tag.id);
    }else if(resetSelection){p.enabled=true;p.lastSelected=0;}
    return p;
  }
  function moveOverdue(s,now=Date.now()) {
    const today=day(now);if(s.overdueCheckDay===today)return 0;s.overdueCheckDay=today;
    const overdue=s.tasks.filter(t=>!t.done&&isDated(t)&&t.date<today);
    for(const t of overdue)queueTask(s,t,taskOverdueDate(s,t,today),false,now);
    if(!overdue.length)return 0;
    const moved=new Set(overdue.map(t=>t.id));s.tasks=s.tasks.filter(t=>!moved.has(t.id));
    s.lastRotation=now;
    return overdue.length;
  }
  function returnToRequests(s,id,now=Date.now()) {
    const t=s.tasks.find(t=>t.id===id);if(!t)throw Error('Дело уже перенесено или удалено');
    if(t.done)throw Error('Сначала отмените выполнение дела');
    if(!wasOriginalRequest(s,t))throw Error('Вернуть можно только дело, созданное из просьбы');
    const p=queueTask(s,t,taskOverdueDate(s,t,day(now)),true,now);
    s.tasks=s.tasks.filter(t=>t.id!==id);s.lastRotation=now;
    return p;
  }
  function reconcile(s,now=Date.now(),random=Math.random){moveOverdue(s,now);return rotate(s,now,random);}
  function todayTasks(s,today=day()) {
    return s.tasks.filter(t=>isDated(t)&&t.date<=today&&(!t.done||(t.completedDate||t.date)===today));
  }
  function tasksOnDate(s,date) { return s.tasks.filter(t=>isDated(t)&&t.date===date); }
  function calendarCounts(s,today=day()) {
    const counts={};
    for(const t of s.tasks) if(isDated(t)&&t.date>=today) counts[t.date]=(counts[t.date]||0)+1;
    return counts;
  }
  function calendarCells(year,month) {
    const first=new Date(year,month,1,12),offset=(first.getDay()+6)%7;
    return Array.from({length:42},(_,i)=>{
      const d=new Date(year,month,1-offset+i,12);
      return {date:day(d.getTime()),number:d.getDate(),inMonth:d.getMonth()===month};
    });
  }
  function eventDate(e){return e.date||(e.deadline?day(e.deadline):'');}
  function eventReminderAt(e){
    const target=e.deadline||(e.date?new Date(e.date+'T09:00:00').getTime():0);
    return target?target-(e.remindBeforeHours||0)*HOUR:0;
  }
  function eventCounts(s){const counts={};for(const e of s.events||[]){const date=eventDate(e);if(date)counts[date]=(counts[date]||0)+1;}return counts;}
  function graphFor(s,project){return (s.graphs||[]).find(g=>g.project===project);}
  function ensureGraph(s,project){
    if(!s.projects.some(p=>p.id===project))throw Error('Проект не найден');
    let graph=graphFor(s,project);if(!graph){graph={project,nodes:[],edges:[]};s.graphs.push(graph);}return graph;
  }
  function graphLevels(graph){
    const levels=Object.fromEntries(graph.nodes.map(n=>[n.id,0])),indegree=Object.fromEntries(graph.nodes.map(n=>[n.id,0])),outgoing=Object.fromEntries(graph.nodes.map(n=>[n.id,[]]));
    for(const edge of graph.edges){indegree[edge.to]++;outgoing[edge.from].push(edge.to);}
    const queue=graph.nodes.map(n=>n.id).filter(id=>indegree[id]===0);let visited=0;
    for(let i=0;i<queue.length;i++){
      const from=queue[i];visited++;
      for(const to of outgoing[from]){levels[to]=Math.max(levels[to],levels[from]+1);if(--indegree[to]===0)queue.push(to);}
    }
    if(visited!==graph.nodes.length)throw Error('В графе обнаружен цикл');
    return levels;
  }
  function addGraphNode(s,project,text,parentId=''){
    const graph=ensureGraph(s,project);
    if(!text.trim()||text.length>120)throw Error('Напишите идею до 120 символов');
    if(graph.nodes.length&&!parentId)throw Error('Выберите родительскую вершину');
    if(parentId&&!graph.nodes.some(n=>n.id===parentId))throw Error('Родительская вершина не найдена');
    const node={id:uid(),text:text.trim(),taskIds:[]};graph.nodes.push(node);
    if(parentId)graph.edges.push({from:parentId,to:node.id});return node;
  }
  function addGraphEdge(s,project,from,to){
    const graph=ensureGraph(s,project);
    if(from===to||!graph.nodes.some(n=>n.id===from)||!graph.nodes.some(n=>n.id===to))throw Error('Выберите две разные вершины');
    if(graph.edges.some(e=>e.from===from&&e.to===to))throw Error('Эти вершины уже соединены');
    const levels=graphLevels(graph);
    if(levels[from]>=levels[to])throw Error('Связь ведёт от нижней вершины к более высокой');
    graph.edges.push({from,to});return graph;
  }
  function attachGraphTask(s,project,nodeId,taskId){
    const graph=ensureGraph(s,project),node=graph.nodes.find(n=>n.id===nodeId),task=s.tasks.find(t=>t.id===taskId&&t.project===project);
    if(!node||!task)throw Error('Вершина или дело не найдены в проекте');
    if(!node.taskIds.includes(taskId))node.taskIds.push(taskId);
  }
  function graphLayout(graph,minWidth=340,minHeight=550){
    const levels=graphLevels(graph),maxLevel=Math.max(0,...Object.values(levels)),layers=Array.from({length:maxLevel+1},()=>[]);
    for(const node of graph.nodes)layers[levels[node.id]].push(node.id);
    const parents=Object.fromEntries(graph.nodes.map(n=>[n.id,[]])),children=Object.fromEntries(graph.nodes.map(n=>[n.id,[]]));
    for(const edge of graph.edges){parents[edge.to].push(edge.from);children[edge.from].push(edge.to);}
    const reorder=(level,neighborLevel)=>{
      const indices=Object.fromEntries(layers[neighborLevel].map((id,i)=>[id,i])),oldOrder=Object.fromEntries(layers[level].map((id,i)=>[id,i])),neighbors=neighborLevel<level?parents:children;
      const mean=id=>{const found=neighbors[id].filter(other=>indices[other]!==undefined).map(other=>indices[other]);return found.length?found.reduce((sum,x)=>sum+x,0)/found.length:oldOrder[id];};
      layers[level].sort((a,b)=>{
        return mean(a)-mean(b)||oldOrder[a]-oldOrder[b];
      });
    };
    for(let pass=0;pass<5;pass++){
      for(let level=1;level<=maxLevel;level++)reorder(level,level-1);
      for(let level=maxLevel-1;level>=0;level--)reorder(level,level+1);
    }
    const width=Math.max(minWidth,...layers.map(layer=>layer.length*206+40)),height=Math.max(minHeight,150+maxLevel*154+90),positions={};
    for(let level=0;level<layers.length;level++)for(let i=0;i<layers[level].length;i++){
      positions[layers[level][i]]={x:width/2+(i-(layers[level].length-1)/2)*206,y:height-78-level*154,level};
    }
    return {width,height,positions,layers};
  }
  function sortedProjectTasks(s,project){return s.tasks.filter(t=>t.project===project).sort((a,b)=>{
    const aDate=a.scheduled===true?a.date:'',bDate=b.scheduled===true?b.date:'';
    return aDate&&bDate?aDate.localeCompare(bDate):aDate?-1:bDate?1:0;
  });}
  const threshold = i => i === 0 ? 0 : Math.round(100*Math.pow(i,1.65));
  function rank(xp) { let i=0; while(i<rankNames.length-1 && xp>=threshold(i+1)) i++; return {index:i,name:rankNames[i],start:threshold(i),next:i===rankNames.length-1?null:threshold(i+1)}; }
  function assignedTags(s,p){return s.tags.filter(t=>p.tags.includes(t.id));}
  function cooldown(s,p) { const tags=assignedTags(s,p);return (tags.length?Math.max(...tags.map(t=>t.hours)):48)*HOUR; }
  function cooldownUntil(s,p){
    const tags=assignedTags(s,p);
    if(!tags.length)return s.untaggedLastSelected? s.untaggedLastSelected+48*HOUR:0;
    return Math.max(0,...tags.map(t=>Object.hasOwn(s.tagLastSelected||{},t.id)&&t.hours?s.tagLastSelected[t.id]+t.hours*HOUR:0));
  }
  function markSelected(s,p,now){
    p.lastSelected=now;
    const tags=assignedTags(s,p);
    if(tags.length)for(const t of tags)s.tagLastSelected={...s.tagLastSelected,[t.id]:now};
    else s.untaggedLastSelected=now;
  }
  function availability(s,p,now=Date.now()) {
    const cooldownMillis=cooldown(s,p),availableAt=cooldownUntil(s,p);
    const task=s.tasks.find(t=>(t.source===p.id&&!t.done)||t.id===p.taskBackup?.id);
    const kind=!p.enabled?'excluded':task?'pending':availableAt>now?'cooldown':'ready';
    return {kind,eligible:kind==='ready',availableAt,remainingMs:Math.max(0,availableAt-now),cooldownMillis,task};
  }
  function eligible(s,p,now=Date.now()) { return availability(s,p,now).eligible; }
  function queuedSince(s,p,now=Date.now()){return p.queuedAt??s.queueClockStartedAt??now;}
  function selectionStats(s,now=Date.now()) {
    const stats=Object.create(null);let total=0;
    for(const p of s.pool){
      const queuedAt=queuedSince(s,p,now),weight=eligible(s,p,now)?Math.max(1,now-queuedAt):0;
      stats[p.id]={queuedAt,weight,probability:0,estimated:p.queuedAt===undefined};total+=weight;
    }
    if(total)for(const item of Object.values(stats))item.probability=item.weight/total;
    return stats;
  }
  function select(s,now=Date.now(),random=Math.random) {
    const stats=selectionStats(s,now),available=s.pool.filter(p=>stats[p.id].weight>0);if(!available.length)return null;
    let ticket=random()*available.reduce((sum,p)=>sum+stats[p.id].weight,0),p=available[available.length-1];
    for(const candidate of available){ticket-=stats[candidate.id].weight;if(ticket<0){p=candidate;break;}}
    const t=p.taskBackup?JSON.parse(JSON.stringify(p.taskBackup)):{id:uid(),rewarded:false};
    if(p.overdueDate)t.overdueDate=p.overdueDate;
    delete t.requestBackup;delete t.manualRequest;
    Object.assign(t,{title:p.title,date:day(now),project:s.projects.some(x=>x.id===t.project)?t.project:'',source:p.id,requestOrigin:p.requestOrigin??(!p.taskBackup||!!p.taskBackup.source),done:false,reminder:t.reminder>now?t.reminder:0,notified:false});
    if(p.taskBackup)t.scheduled=true;
    s.tasks.push(t);markSelected(s,p,now);return t;
  }
  // Explicit scheduling is a user decision, independent of automatic cooldown/exclusions.
  function scheduleRequest(s,id,date,now=Date.now()) {
    if(!validDay(date)||date<day(now))throw Error('Выберите сегодня или будущую дату');
    const p=s.pool.find(p=>p.id===id);if(!p)throw Error('Просьба уже перенесена или удалена');
    const existing=s.tasks.find(t=>(t.source===id&&!t.done)||t.id===p.taskBackup?.id);
    if(existing?.done)throw Error('Эта задача уже выполнена');
    const t=existing||(p.taskBackup?JSON.parse(JSON.stringify(p.taskBackup)):{id:uid(),rewarded:false});
    Object.assign(t,{title:p.title,date,scheduled:true,project:s.projects.some(x=>x.id===t.project)?t.project:'',source:p.id,requestOrigin:p.requestOrigin??(!p.taskBackup||!!p.taskBackup.source),done:false,manualRequest:true,reminder:t.reminder>now&&day(t.reminder)>=date?t.reminder:0,notified:false});
    if(p.overdueDate)t.overdueDate=p.overdueDate;
    markSelected(s,p,now);t.requestBackup=JSON.parse(JSON.stringify(p));
    if(!existing)s.tasks.push(t);s.pool=s.pool.filter(p=>p.id!==id);return t;
  }
  function rotate(s,now=Date.now(),random=Math.random) {
    if(!s.auto || (s.lastRotation && now-s.lastRotation<s.intervalHours*HOUR)) return null;
    const t=select(s,now,random); s.lastRotation=now; return t;
  }
  function complete(s,id,now=Date.now()) {
    const t=s.tasks.find(t=>t.id===id);if(!t)return 0;
    if(t.done&&t.repeatNext){
      const later=[...s.tasks,...s.pool.map(p=>p.taskBackup).filter(Boolean)].some(n=>t.repeatSeries&&n.repeatSeries===t.repeatSeries&&n.repeatIndex>(t.repeatIndex||0)+1);
      if(later)throw Error('Сначала отмените выполнение следующих повторов');
      const next=s.tasks.find(n=>n.id===t.repeatNext&&n.repeatParent===id);
      const request=s.pool.find(p=>p.taskBackup?.id===t.repeatNext&&p.taskBackup.repeatParent===id);
      if(next?.done)throw Error('Сначала отмените выполнение следующего повтора');
      if(next){s.tasks=s.tasks.filter(n=>n.id!==next.id);s.pool=s.pool.filter(p=>p.id!==next.source);}
      if(request)s.pool=s.pool.filter(p=>p.id!==request.id);
      delete t.repeatNext;
    }
    if(!t.done){const overdueDate=taskOverdueDate(s,t,day(now));if(overdueDate)t.overdueDate=overdueDate;}
    let next;
    if(!t.done&&t.repeatDays){
      const date=addDays(day(now),t.repeatDays);
      let reminder=0;
      if(t.reminder){const old=new Date(t.reminder),d=new Date(date+'T12:00:00');d.setHours(old.getHours(),old.getMinutes(),0,0);reminder=d.getTime();}
      next={id:uid(),title:t.title,date,scheduled:true,project:t.project,done:false,rewarded:false,source:'',reminder,notified:false,repeatDays:t.repeatDays,repeatParent:t.id,repeatSeries:t.repeatSeries||t.id,repeatIndex:(t.repeatIndex||0)+1};
    }
    t.done=!t.done;let xp=0;
    if(t.done){
      t.completedDate=day(now);
      const request=s.pool.find(p=>p.id===t.source);
      if(request){t.requestBackup=JSON.parse(JSON.stringify(request));s.pool=s.pool.filter(p=>p.id!==request.id);}
      if(next){t.repeatSeries=next.repeatSeries;t.repeatIndex=next.repeatIndex-1;t.repeatNext=next.id;s.tasks.push(next);}
    }else{
      delete t.completedDate;
      if(t.requestBackup&&!t.manualRequest&&!s.pool.some(p=>p.id===t.requestBackup.id))s.pool.push(JSON.parse(JSON.stringify(t.requestBackup)));
    }
    if(t.done&&!t.rewarded){t.rewarded=true;xp=8;s.xp+=xp;}
    return xp;
  }
  function validate(s,now=Date.now()) {
    if(!s||![1,2,3].includes(s.schema)||!Array.isArray(s.tasks)||!Array.isArray(s.pool)||!Array.isArray(s.tags)||!Array.isArray(s.projects)) throw Error('Неподдерживаемый формат резервной копии');
    if([...s.tasks,...s.pool,...s.tags,...s.projects].length>10000) throw Error('Слишком много записей');
    if(s.events!==undefined&&!Array.isArray(s.events)||s.graphs!==undefined&&!Array.isArray(s.graphs))throw Error('Некорректные события или графы');
    const events=s.events||[],graphs=s.graphs||[];
    if(events.length+graphs.reduce((count,g)=>count+(Array.isArray(g?.nodes)?g.nodes.length:0),0)>10000)throw Error('Слишком много событий или вершин');
    const ids=new Set();
    for(const item of [...s.tasks,...s.pool,...s.tags,...s.projects,...events]) {
      if(typeof item.id!=='string'||!/^[\w-]{1,100}$/.test(item.id)||['rotation','day-rollover'].includes(item.id)||ids.has(item.id)) throw Error('Некорректные идентификаторы'); ids.add(item.id);
    }
    for(const item of [...s.tasks,...s.pool]) if(typeof item.title!=='string'||!item.title.trim()||item.title.length>300) throw Error('Некорректное название задачи');
    const requests=[...s.pool,...s.tasks.filter(t=>t.requestBackup).map(t=>t.requestBackup)];
    for(const p of requests) if(typeof p.id!=='string'||!/^[\w-]{1,100}$/.test(p.id)||['rotation','day-rollover'].includes(p.id)||typeof p.title!=='string'||!p.title.trim()||p.title.length>300||!Array.isArray(p.tags)||p.tags.some(t=>typeof t!=='string')||typeof p.enabled!=='boolean'||!Number.isFinite(p.cooldownHours)||p.cooldownHours<0||p.cooldownHours>87600||!Number.isFinite(p.lastSelected)||p.lastSelected<0||(p.requestOrigin!==undefined&&typeof p.requestOrigin!=='boolean')) throw Error('Некорректная просьба');
    for(const t of s.tasks) if(typeof t.done!=='boolean'||typeof t.project!=='string'||!validDay(t.date)||!Number.isFinite(t.reminder)||t.reminder<0||(t.scheduled!==undefined&&typeof t.scheduled!=='boolean')||(t.completedDate!==undefined&&!validDay(t.completedDate))||(t.requestBackup&&t.requestBackup.id!==t.source)||(t.requestOrigin!==undefined&&typeof t.requestOrigin!=='boolean')) throw Error('Некорректная задача');
    for(const ts of [s.queueClockStartedAt,...requests.map(p=>p.queuedAt)])if(ts!==undefined&&(!Number.isSafeInteger(ts)||ts<0||ts>8640000000000000))throw Error('Некорректная дата добавления в очередь');
    for(const p of requests) {
      if(p.overdueDate!==undefined&&!validDay(p.overdueDate))throw Error('Некорректная дата просроченной просьбы');
      const t=p.taskBackup;
      if(t&&(typeof t.id!=='string'||!/^[\w-]{1,100}$/.test(t.id)||['rotation','day-rollover'].includes(t.id)||typeof t.title!=='string'||!t.title.trim()||t.title.length>300||typeof t.project!=='string'||!validDay(t.date)||t.done!==false||!Number.isFinite(t.reminder)||t.reminder<0||t.requestBackup!==undefined||(t.scheduled!==undefined&&typeof t.scheduled!=='boolean')))throw Error('Некорректная задача в просьбе');
    }
    for(const t of [...s.tasks,...requests.map(p=>p.taskBackup).filter(Boolean)]) {
      if(t.overdueDate!==undefined&&!validDay(t.overdueDate))throw Error('Некорректная дата просроченного дела');
      if(t.repeatDays!==undefined&&(!Number.isInteger(t.repeatDays)||t.repeatDays<0||t.repeatDays>3650))throw Error('Интервал повтора должен быть целым числом от 1 до 3650 дней');
      for(const key of ['repeatNext','repeatParent','repeatSeries'])if(t[key]!==undefined&&(typeof t[key]!=='string'||!/^[\w-]{1,100}$/.test(t[key])||(key!=='repeatSeries'&&t[key]===t.id)))throw Error('Некорректная связь повторяющихся дел');
      if(t.repeatIndex!==undefined&&(!Number.isInteger(t.repeatIndex)||t.repeatIndex<0||t.repeatIndex>1000000||!t.repeatSeries))throw Error('Некорректный номер повтора');
      if(t.manualRequest!==undefined&&typeof t.manualRequest!=='boolean')throw Error('Некорректный перенос просьбы');
    }
    for(const t of s.tags) if(typeof t.name!=='string'||!t.name.trim()||t.name.length>60||!Number.isFinite(t.hours)||t.hours<0||t.hours>87600) throw Error('Некорректный тег');
    if(s.tagCooldownVersion!==undefined&&s.tagCooldownVersion!==1)throw Error('Некорректная версия правил ожидания');
    if(s.tagCooldownVersion===1&&(s.tagLastSelected===undefined||s.untaggedLastSelected===undefined))throw Error('Неполная история ожидания просьб');
    if(s.tagLastSelected!==undefined&&(typeof s.tagLastSelected!=='object'||!s.tagLastSelected||Array.isArray(s.tagLastSelected)||Object.entries(s.tagLastSelected).some(([id,ts])=>!/^[\w-]{1,100}$/.test(id)||!Number.isSafeInteger(ts)||ts<0||ts>8640000000000000)))throw Error('Некорректная история ожидания тегов');
    if(s.untaggedLastSelected!==undefined&&(!Number.isSafeInteger(s.untaggedLastSelected)||s.untaggedLastSelected<0||s.untaggedLastSelected>8640000000000000))throw Error('Некорректная история ожидания просьб');
    for(const p of s.projects) if(typeof p.name!=='string'||!p.name.trim()||p.name.length>60) throw Error('Некорректный проект');
    for(const e of events){
      if(typeof e.title!=='string'||!e.title.trim()||e.title.length>300||typeof e.description!=='string'||e.description.length>5000||typeof e.date!=='string'||(e.date&&!validDay(e.date))||!Number.isSafeInteger(e.deadline)||e.deadline<0||e.deadline>8640000000000000||!Number.isFinite(e.remindBeforeHours)||e.remindBeforeHours<0||e.remindBeforeHours>87600||typeof e.notified!=='boolean')throw Error('Некорректное событие');
    }
    const projects=new Set(s.projects.map(p=>p.id)),graphProjects=new Set();
    for(const g of graphs){
      if(!g||typeof g.project!=='string'||!projects.has(g.project)||graphProjects.has(g.project)||!Array.isArray(g.nodes)||!Array.isArray(g.edges)||g.edges.length>20000)throw Error('Некорректный граф проекта');
      graphProjects.add(g.project);const nodeIds=new Set();
      for(const n of g.nodes){
        if(!n||typeof n.id!=='string'||!/^[\w-]{1,100}$/.test(n.id)||ids.has(n.id)||nodeIds.has(n.id)||typeof n.text!=='string'||!n.text.trim()||n.text.length>120||!Array.isArray(n.taskIds)||n.taskIds.some(id=>typeof id!=='string'||!s.tasks.some(t=>t.id===id&&t.project===g.project)&&!s.pool.some(p=>p.taskBackup?.id===id&&p.taskBackup.project===g.project)))throw Error('Некорректная вершина графа');
        nodeIds.add(n.id);ids.add(n.id);
      }
      const edges=new Set();for(const e of g.edges){const key=e?.from+'→'+e?.to;if(!e||!nodeIds.has(e.from)||!nodeIds.has(e.to)||e.from===e.to||edges.has(key))throw Error('Некорректное ребро графа');edges.add(key);}
      graphLevels(g);
    }
    if(!Number.isFinite(s.xp)||s.xp<0||s.xp>1e9||!Number.isFinite(s.intervalHours)||s.intervalHours<.25||s.intervalHours>8760||typeof s.auto!=='boolean'||!Number.isFinite(s.lastRotation)||s.lastRotation<0) throw Error('Некорректные настройки');
    if(s.overdueCheckDay!==undefined&&!validDay(s.overdueCheckDay))throw Error('Некорректная дата обработки задач');
    return migrate(s,now);
  }
  const API={HOUR,rankNames,uid,day,validDay,addDays,initial,migrate,prepareImport,isDated,isOverdueRequest,wasOriginalRequest,taskOverdueDate,moveOverdue,returnToRequests,reconcile,todayTasks,tasksOnDate,calendarCounts,calendarCells,eventDate,eventReminderAt,eventCounts,graphFor,ensureGraph,graphLevels,addGraphNode,addGraphEdge,attachGraphTask,graphLayout,sortedProjectTasks,threshold,rank,cooldown,cooldownUntil,markSelected,availability,eligible,queuedSince,selectionStats,select,scheduleRequest,rotate,complete,validate};
  if(typeof module!=='undefined') module.exports=API; else root.Model=API;
})(typeof window!=='undefined'?window:globalThis);
