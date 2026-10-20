(function(root) {
  'use strict';
  const HOUR = 3600000;
  const rankNames = ['Первый шаг','Искра','Росток','Наблюдатель','Искатель','Ученик','Практик','Следопыт','Собиратель','Проводник','Ремесленник','Созидатель','Навигатор','Знаток','Стратег','Хранитель ритма','Исследователь','Архитектор дня','Мастер привычек','Алхимик','Покоритель вершин','Капитан','Виртуоз','Наставник','Хранитель времени','Мастер фокуса','Первооткрыватель','Маэстро','Зодчий','Мудрец','Вдохновитель','Повелитель ритма','Картограф','Хранитель баланса','Грандмастер','Покоритель горизонтов','Творец порядка','Светоч','Пилигрим','Хранитель огня','Архитектор перемен','Астральный странник','Мастер пути','Проводник света','Созвездие','Хранитель рассвета','Творец миров','Повелитель времени','Легенда','Северная звезда','Оракул','Хранитель вселенной','Бесконечный горизонт','Источник вдохновения','Вечный двигатель','Сверхновая','Космический архитектор','Мастер бесконечности','За гранью возможного','Абсолют'];
  const uid = () => (root.crypto?.randomUUID?.() || Date.now().toString(36)+Math.random().toString(36).slice(2));
  const day = (ts=Date.now()) => { const d=new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const initial = () => ({schema:1,tasks:[],pool:[],tags:[],projects:[],xp:0,theme:'sage',intervalHours:8,auto:true,lastRotation:0});
  const threshold = i => i === 0 ? 0 : Math.round(100*Math.pow(i,1.65));
  function rank(xp) { let i=0; while(i<rankNames.length-1 && xp>=threshold(i+1)) i++; return {index:i,name:rankNames[i],start:threshold(i),next:i===rankNames.length-1?null:threshold(i+1)}; }
  function cooldown(s,p) { return Math.max(p.cooldownHours,...p.tags.map(id=>s.tags.find(t=>t.id===id)?.hours||0))*HOUR; }
  function eligible(s,p,now=Date.now()) { return p.enabled && !s.tasks.some(t=>t.source===p.id&&!t.done) && (!p.lastSelected || now-p.lastSelected>=cooldown(s,p)); }
  function select(s,now=Date.now(),random=Math.random) {
    const available=s.pool.filter(p=>eligible(s,p,now)); if(!available.length) return null;
    const p=available[Math.min(available.length-1,Math.floor(random()*available.length))];
    const t={id:uid(),title:p.title,date:day(now),project:'',source:p.id,done:false,rewarded:false,reminder:0};
    s.tasks.push(t); p.lastSelected=now; return t;
  }
  function rotate(s,now=Date.now(),random=Math.random) {
    if(!s.auto || (s.lastRotation && now-s.lastRotation<s.intervalHours*HOUR)) return null;
    const t=select(s,now,random); s.lastRotation=now; return t;
  }
  function complete(s,id) {
    const t=s.tasks.find(t=>t.id===id); if(!t) return 0;
    t.done=!t.done; let xp=0;
    if(t.done&&!t.rewarded) { t.rewarded=true; xp=20; s.xp+=xp; }
    return xp;
  }
  function validate(s) {
    if(!s||s.schema!==1||!Array.isArray(s.tasks)||!Array.isArray(s.pool)||!Array.isArray(s.tags)||!Array.isArray(s.projects)) throw Error('Неподдерживаемый формат резервной копии');
    if([...s.tasks,...s.pool,...s.tags,...s.projects].length>10000) throw Error('Слишком много записей');
    const ids=new Set();
    for(const item of [...s.tasks,...s.pool,...s.tags,...s.projects]) {
      if(typeof item.id!=='string'||!/^[\w-]{1,100}$/.test(item.id)||ids.has(item.id)) throw Error('Некорректные идентификаторы'); ids.add(item.id);
    }
    for(const item of [...s.tasks,...s.pool]) if(typeof item.title!=='string'||!item.title.trim()||item.title.length>300) throw Error('Некорректное название задачи');
    for(const p of s.pool) if(!Array.isArray(p.tags)||p.tags.some(t=>typeof t!=='string')||typeof p.enabled!=='boolean'||!Number.isFinite(p.cooldownHours)||p.cooldownHours<0||p.cooldownHours>87600||!Number.isFinite(p.lastSelected)||p.lastSelected<0) throw Error('Некорректное регулярное дело');
    for(const t of s.tasks) if(typeof t.done!=='boolean'||typeof t.project!=='string'||typeof t.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(t.date)||!Number.isFinite(t.reminder)||t.reminder<0) throw Error('Некорректная задача');
    for(const t of s.tags) if(typeof t.name!=='string'||!t.name.trim()||t.name.length>60||!Number.isFinite(t.hours)||t.hours<0||t.hours>87600) throw Error('Некорректный тег');
    for(const p of s.projects) if(typeof p.name!=='string'||!p.name.trim()||p.name.length>60) throw Error('Некорректный проект');
    if(!Number.isFinite(s.xp)||s.xp<0||s.xp>1e9||!Number.isFinite(s.intervalHours)||s.intervalHours<.25||s.intervalHours>8760||typeof s.auto!=='boolean'||!Number.isFinite(s.lastRotation)||s.lastRotation<0) throw Error('Некорректные настройки');
    return s;
  }
  const API={HOUR,rankNames,uid,day,initial,threshold,rank,cooldown,eligible,select,rotate,complete,validate};
  if(typeof module!=='undefined') module.exports=API; else root.Model=API;
})(typeof window!=='undefined'?window:globalThis);
