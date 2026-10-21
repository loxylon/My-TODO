(function(root) {
  'use strict';
  const HOUR = 3600000;
  const rankNames = ['Первый шаг','Искра','Росток','Наблюдатель','Искатель','Ученик','Практик','Следопыт','Собиратель','Проводник','Ремесленник','Созидатель','Навигатор','Знаток','Стратег','Хранитель ритма','Исследователь','Архитектор дня','Мастер привычек','Алхимик','Покоритель вершин','Капитан','Виртуоз','Наставник','Хранитель времени','Мастер фокуса','Первооткрыватель','Маэстро','Зодчий','Мудрец','Вдохновитель','Повелитель ритма','Картограф','Хранитель баланса','Грандмастер','Покоритель горизонтов','Творец порядка','Светоч','Пилигрим','Хранитель огня','Архитектор перемен','Астральный странник','Мастер пути','Проводник света','Созвездие','Хранитель рассвета','Творец миров','Повелитель времени','Легенда','Северная звезда','Оракул','Хранитель вселенной','Бесконечный горизонт','Источник вдохновения','Вечный двигатель','Сверхновая','Космический архитектор','Мастер бесконечности','За гранью возможного','Абсолют'];
  const uid = () => (root.crypto?.randomUUID?.() || Date.now().toString(36)+Math.random().toString(36).slice(2));
  const day = (ts=Date.now()) => { const d=new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const initial = () => ({schema:3,tasks:[],pool:[],tags:[],projects:[],xp:0,theme:'sage',intervalHours:8,auto:true,lastRotation:0,overdueCheckDay:day()});
  function validDay(value) {
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d=new Date(value+'T12:00:00');
    return Number.isFinite(d.getTime())&&day(d.getTime())===value;
  }
  function normalizeCooldowns(s) {
    const pending=[...s.pool,...s.tasks.map(t=>t.requestBackup).filter(Boolean)],seen=new Set();
    while(pending.length){const p=pending.pop();if(seen.has(p))continue;seen.add(p);p.cooldownHours=0;if(p.taskBackup?.requestBackup)pending.push(p.taskBackup.requestBackup);}
  }
  function migrate(s,now=Date.now()) {
    if(s.schema<3){s.schema=3;s.overdueCheckDay=day(now);s.lastRotation=now;}
    normalizeCooldowns(s);
    return s;
  }
  function prepareImport(s,now=Date.now()){validate(s,now);s.overdueCheckDay=day(now);s.lastRotation=now;return s;}
  function isDated(t) { return !t.project||t.scheduled===true; }
  function moveOverdue(s,now=Date.now()) {
    const today=day(now);if(s.overdueCheckDay===today)return 0;s.overdueCheckDay=today;
    const overdue=s.tasks.filter(t=>!t.done&&isDated(t)&&t.date<today);
    if(!overdue.length)return 0;
    let tag=s.tags.find(t=>t.name.trim().toLowerCase()==='просроченные');
    if(!tag){tag={id:uid(),name:'просроченные',hours:0};s.tags.push(tag);}
    for(const t of overdue){
      let p=s.pool.find(p=>p.id===t.source&&(!p.taskBackup||p.taskBackup.id===t.id));
      if(!p){p={id:uid(),title:t.title,tags:[],cooldownHours:0,enabled:true,lastSelected:0};s.pool.push(p);}
      const backup=JSON.parse(JSON.stringify(t));delete backup.requestBackup;
      p.title=t.title;p.taskBackup=backup;p.overdueDate=t.date;
      if(!p.tags.includes(tag.id))p.tags.push(tag.id);
    }
    const moved=new Set(overdue.map(t=>t.id));s.tasks=s.tasks.filter(t=>!moved.has(t.id));
    // Keep transferred requests in the queue until the next normal selection tick.
    s.lastRotation=now;
    return overdue.length;
  }
  function reconcile(s,now=Date.now(),random=Math.random){moveOverdue(s,now);return rotate(s,now,random);}
  function todayTasks(s,today=day()) {
    return s.tasks.filter(t=>isDated(t)&&t.date<=today&&(!t.done||(t.completedDate||t.date)===today));
  }
  function tasksOnDate(s,date) { return s.tasks.filter(t=>isDated(t)&&t.date===date); }
  function calendarCounts(s) {
    const counts={};
    for(const t of s.tasks) if(isDated(t)) counts[t.date]=(counts[t.date]||0)+1;
    return counts;
  }
  function calendarCells(year,month) {
    const first=new Date(year,month,1,12),offset=(first.getDay()+6)%7;
    return Array.from({length:42},(_,i)=>{
      const d=new Date(year,month,1-offset+i,12);
      return {date:day(d.getTime()),number:d.getDate(),inMonth:d.getMonth()===month};
    });
  }
  const threshold = i => i === 0 ? 0 : Math.round(100*Math.pow(i,1.65));
  function rank(xp) { let i=0; while(i<rankNames.length-1 && xp>=threshold(i+1)) i++; return {index:i,name:rankNames[i],start:threshold(i),next:i===rankNames.length-1?null:threshold(i+1)}; }
  function cooldown(s,p) { return Math.max(0,...p.tags.map(id=>s.tags.find(t=>t.id===id)?.hours||0))*HOUR; }
  function availability(s,p,now=Date.now()) {
    const cooldownMillis=cooldown(s,p),availableAt=cooldownMillis>0&&p.lastSelected?p.lastSelected+cooldownMillis:0;
    const task=s.tasks.find(t=>(t.source===p.id&&!t.done)||t.id===p.taskBackup?.id);
    const kind=!p.enabled?'excluded':task?'pending':availableAt>now?'cooldown':'ready';
    return {kind,eligible:kind==='ready',availableAt,remainingMs:Math.max(0,availableAt-now),cooldownMillis,task};
  }
  function eligible(s,p,now=Date.now()) { return availability(s,p,now).eligible; }
  function select(s,now=Date.now(),random=Math.random) {
    const available=s.pool.filter(p=>eligible(s,p,now)); if(!available.length) return null;
    const p=available[Math.min(available.length-1,Math.floor(random()*available.length))];
    const t=p.taskBackup?JSON.parse(JSON.stringify(p.taskBackup)):{id:uid(),rewarded:false};
    delete t.requestBackup;
    Object.assign(t,{title:p.title,date:day(now),project:s.projects.some(x=>x.id===t.project)?t.project:'',source:p.id,done:false,reminder:t.reminder>now?t.reminder:0,notified:false});
    if(p.taskBackup)t.scheduled=true;
    s.tasks.push(t); p.lastSelected=now; return t;
  }
  function rotate(s,now=Date.now(),random=Math.random) {
    if(!s.auto || (s.lastRotation && now-s.lastRotation<s.intervalHours*HOUR)) return null;
    const t=select(s,now,random); s.lastRotation=now; return t;
  }
  function complete(s,id,now=Date.now()) {
    const t=s.tasks.find(t=>t.id===id); if(!t) return 0;
    t.done=!t.done; let xp=0;
    if(t.done) {
      t.completedDate=day(now);
      const request=s.pool.find(p=>p.id===t.source);
      if(request) { t.requestBackup=JSON.parse(JSON.stringify(request)); s.pool=s.pool.filter(p=>p.id!==request.id); }
    } else {
      delete t.completedDate;
      if(t.requestBackup&&!s.pool.some(p=>p.id===t.requestBackup.id)) s.pool.push(JSON.parse(JSON.stringify(t.requestBackup)));
    }
    if(t.done&&!t.rewarded) { t.rewarded=true; xp=20; s.xp+=xp; }
    return xp;
  }
  function validate(s,now=Date.now()) {
    if(!s||![1,2,3].includes(s.schema)||!Array.isArray(s.tasks)||!Array.isArray(s.pool)||!Array.isArray(s.tags)||!Array.isArray(s.projects)) throw Error('Неподдерживаемый формат резервной копии');
    if([...s.tasks,...s.pool,...s.tags,...s.projects].length>10000) throw Error('Слишком много записей');
    const ids=new Set();
    for(const item of [...s.tasks,...s.pool,...s.tags,...s.projects]) {
      if(typeof item.id!=='string'||!/^[\w-]{1,100}$/.test(item.id)||['rotation','day-rollover'].includes(item.id)||ids.has(item.id)) throw Error('Некорректные идентификаторы'); ids.add(item.id);
    }
    for(const item of [...s.tasks,...s.pool]) if(typeof item.title!=='string'||!item.title.trim()||item.title.length>300) throw Error('Некорректное название задачи');
    const requests=[...s.pool,...s.tasks.filter(t=>t.requestBackup).map(t=>t.requestBackup)];
    for(const p of requests) if(typeof p.id!=='string'||!/^[\w-]{1,100}$/.test(p.id)||['rotation','day-rollover'].includes(p.id)||typeof p.title!=='string'||!p.title.trim()||p.title.length>300||!Array.isArray(p.tags)||p.tags.some(t=>typeof t!=='string')||typeof p.enabled!=='boolean'||!Number.isFinite(p.cooldownHours)||p.cooldownHours<0||p.cooldownHours>87600||!Number.isFinite(p.lastSelected)||p.lastSelected<0) throw Error('Некорректная просьба');
    for(const t of s.tasks) if(typeof t.done!=='boolean'||typeof t.project!=='string'||!validDay(t.date)||!Number.isFinite(t.reminder)||t.reminder<0||(t.scheduled!==undefined&&typeof t.scheduled!=='boolean')||(t.completedDate!==undefined&&!validDay(t.completedDate))||(t.requestBackup&&t.requestBackup.id!==t.source)) throw Error('Некорректная задача');
    for(const p of requests) {
      if(p.overdueDate!==undefined&&!validDay(p.overdueDate))throw Error('Некорректная дата просроченной просьбы');
      const t=p.taskBackup;
      if(t&&(typeof t.id!=='string'||!/^[\w-]{1,100}$/.test(t.id)||['rotation','day-rollover'].includes(t.id)||typeof t.title!=='string'||!t.title.trim()||t.title.length>300||typeof t.project!=='string'||!validDay(t.date)||t.done!==false||!Number.isFinite(t.reminder)||t.reminder<0||t.requestBackup!==undefined||(t.scheduled!==undefined&&typeof t.scheduled!=='boolean')))throw Error('Некорректная задача в просьбе');
    }
    for(const t of s.tags) if(typeof t.name!=='string'||!t.name.trim()||t.name.length>60||!Number.isFinite(t.hours)||t.hours<0||t.hours>87600) throw Error('Некорректный тег');
    for(const p of s.projects) if(typeof p.name!=='string'||!p.name.trim()||p.name.length>60) throw Error('Некорректный проект');
    if(!Number.isFinite(s.xp)||s.xp<0||s.xp>1e9||!Number.isFinite(s.intervalHours)||s.intervalHours<.25||s.intervalHours>8760||typeof s.auto!=='boolean'||!Number.isFinite(s.lastRotation)||s.lastRotation<0) throw Error('Некорректные настройки');
    if(s.overdueCheckDay!==undefined&&!validDay(s.overdueCheckDay))throw Error('Некорректная дата обработки задач');
    return migrate(s,now);
  }
  const API={HOUR,rankNames,uid,day,validDay,initial,migrate,prepareImport,isDated,moveOverdue,reconcile,todayTasks,tasksOnDate,calendarCounts,calendarCells,threshold,rank,cooldown,availability,eligible,select,rotate,complete,validate};
  if(typeof module!=='undefined') module.exports=API; else root.Model=API;
})(typeof window!=='undefined'?window:globalThis);
