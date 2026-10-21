const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../app/src/main/assets/model.js');
const now=new Date('2026-10-21T12:00:00').getTime();
const task=(extra={})=>({id:'task',title:'Проверить фильтр',date:'2026-10-21',scheduled:true,project:'',done:false,rewarded:false,source:'',reminder:0,...extra});
const request=(extra={})=>({id:'request',title:'Забрать книгу',tags:[],enabled:true,cooldownHours:0,lastSelected:0,...extra});
function state(){const s=M.initial();s.auto=false;s.overdueCheckDay=M.day(now);return s;}
test('manual request scheduling ignores auto exclusions/cooldown, removes request and uses selected date',()=>{
  const s=state();s.tags=[{id:'tag',name:'дом',hours:24}];s.pool=[request({enabled:false,tags:['tag'],lastSelected:now})];
  const t=M.scheduleRequest(s,'request','2026-11-02',now);assert.equal(t.date,'2026-11-02');assert.equal(s.pool.length,0);assert.equal(s.tasks.length,1);assert.equal(t.source,'request');assert.equal(t.requestBackup.enabled,false);assert.deepEqual(t.requestBackup.tags,['tag']);assert.equal(s.xp,0);assert.equal(M.todayTasks(s,'2026-11-01').length,0);assert.equal(M.todayTasks(s,'2026-11-02').length,1);assert.equal(M.calendarCounts(s)['2026-11-02'],1);
  M.complete(s,t.id,now);M.complete(s,t.id,now);assert.equal(s.pool.length,0,'undo completion keeps a manual task out of the request queue');assert.equal(s.xp,20);
});
test('manual rescheduling moves the already selected task without duplicating identity project or reward',()=>{
  const s=state();s.projects=[{id:'work',name:'Работа'}];s.pool=[request()];s.tasks=[task({project:'work',source:'request',rewarded:true,repeatDays:7})];
  const t=M.scheduleRequest(s,'request','2026-10-25',now);assert.equal(t.id,'task');assert.equal(t.project,'work');assert.equal(t.rewarded,true);assert.equal(t.repeatDays,7);assert.equal(s.tasks.length,1);assert.equal(s.pool.length,0);
});
test('overdue manually scheduled requests retain tags exclusion and task metadata when returned and selected',()=>{
  const s=state();s.projects=[{id:'work',name:'Работа'}];s.tags=[{id:'tag',name:'дом',hours:24}];s.pool=[request({tags:['tag'],enabled:false,taskBackup:task({project:'work',repeatDays:3})})];
  M.scheduleRequest(s,'request','2026-10-21',now);M.moveOverdue(s,now+24*M.HOUR);assert.equal(s.tasks.length,0);assert.equal(s.pool.length,1);const p=s.pool[0];assert.equal(p.id,'request');assert.equal(p.enabled,false);assert.ok(p.tags.includes('tag'));assert.equal(p.taskBackup.repeatDays,3);assert.equal(p.taskBackup.requestBackup,undefined);
  p.enabled=true;const t=M.select(s,now+48*M.HOUR);assert.equal(t.id,'task');assert.equal(t.project,'work');assert.equal(t.manualRequest,undefined);M.complete(s,t.id,now+48*M.HOUR);M.complete(s,t.id,now+48*M.HOUR);assert.equal(s.pool.length,1);assert.deepEqual(M.validate(JSON.parse(JSON.stringify(s)),now+48*M.HOUR),s);
});
test('invalid dates, missing requests, or repeated scheduling cannot mutate records',()=>{
  const s=state();s.pool=[request()];const raw=JSON.stringify(s);for(const date of ['2026-10-20','2026-02-30','oops']){assert.throws(()=>M.scheduleRequest(s,'request',date,now));assert.equal(JSON.stringify(s),raw);}assert.throws(()=>M.scheduleRequest(s,'missing','2026-10-21',now));M.scheduleRequest(s,'request','2026-10-21',now);assert.throws(()=>M.scheduleRequest(s,'request','2026-10-22',now));assert.equal(s.tasks.length,1);
});
test('repeat is scheduled from actual completion day, retains project/time and earns XP once per occurrence',()=>{
  const s=state();s.projects=[{id:'work',name:'Работа'}];s.tasks=[task({project:'work',repeatDays:3,reminder:new Date('2026-10-21T18:35:00').getTime()})];
  const completed=new Date('2026-10-25T20:00:00').getTime();assert.equal(M.complete(s,'task',completed),20);const next=s.tasks[1];assert.equal(next.date,'2026-10-28');assert.equal(next.project,'work');assert.equal(next.scheduled,true);assert.equal(next.repeatDays,3);assert.equal(next.source,'');assert.equal(next.rewarded,false);assert.equal(M.day(next.reminder),'2026-10-28');assert.equal(new Date(next.reminder).getHours(),18);assert.equal(new Date(next.reminder).getMinutes(),35);assert.equal(M.todayTasks(s,'2026-10-27').some(t=>t.id===next.id),false);assert.equal(M.todayTasks(s,'2026-10-28').some(t=>t.id===next.id),true);M.complete(s,next.id,new Date('2026-10-28T20:00:00').getTime());assert.equal(s.xp,40);assert.equal(s.tasks.filter(t=>!t.done).length,1);assert.equal(s.tasks[2].date,'2026-10-31');
});
test('uncompleted repeats do not accumulate over many missed days or overdue/auto cycles',()=>{
  const s=state();s.tasks=[task({repeatDays:1})];for(let i=1;i<=60;i++)M.reconcile(s,now+i*24*M.HOUR);assert.equal(s.tasks.length,0);assert.equal(s.pool.length,1);assert.equal(s.pool[0].taskBackup.repeatDays,1);assert.equal(s.xp,0);
  const t=M.scheduleRequest(s,s.pool[0].id,M.day(now+60*24*M.HOUR),now+60*24*M.HOUR);M.complete(s,t.id,now+60*24*M.HOUR);assert.equal(s.tasks.filter(t=>!t.done).length,1);assert.equal(s.pool.length,0);assert.equal(s.tasks[1].date,M.addDays(M.day(now+60*24*M.HOUR),1));
});
test('undo/redo cancels the next occurrence, including an overdue next occurrence, without duplicate XP',()=>{
  const s=state();s.tasks=[task({repeatDays:1})];M.complete(s,'task',now);M.complete(s,'task',now);assert.equal(s.tasks.length,1);assert.equal(s.tasks[0].repeatNext,undefined);M.complete(s,'task',now);assert.equal(s.tasks.length,2);assert.equal(s.xp,20);
  M.moveOverdue(s,now+3*24*M.HOUR);assert.equal(s.pool.length,1);M.complete(s,'task',now+3*24*M.HOUR);assert.equal(s.pool.length,0);assert.equal(s.tasks.length,1);assert.equal(s.tasks[0].done,false);M.complete(s,'task',now+3*24*M.HOUR);assert.equal(s.tasks[1].date,'2026-10-25');assert.equal(s.xp,20);
});
test('undo cannot reopen earlier occurrences while a later occurrence is complete, including deleted intermediates',()=>{
  const s=state();s.tasks=[task({repeatDays:1})];M.complete(s,'task',now);const next=s.tasks[1];M.complete(s,next.id,now+24*M.HOUR);let raw=JSON.stringify(s);assert.throws(()=>M.complete(s,'task',now+24*M.HOUR));assert.equal(JSON.stringify(s),raw);
  s.tasks=s.tasks.filter(t=>t.id!==next.id);raw=JSON.stringify(s);assert.throws(()=>M.complete(s,'task',now+24*M.HOUR));assert.equal(JSON.stringify(s),raw);
});
test('zero interval disables further repeats, JSON round trips preserve the complete repeat chain',()=>{
  const s=state();s.tasks=[task({repeatDays:7})];M.complete(s,'task',now);const copy=M.prepareImport(JSON.parse(JSON.stringify(s)),now);assert.deepEqual(copy.tasks,s.tasks);copy.tasks[1].repeatDays=0;M.complete(copy,copy.tasks[1].id,now+7*24*M.HOUR);assert.equal(copy.tasks.length,2);assert.equal(copy.tasks.filter(t=>!t.done).length,0);
});
test('invalid repeat configuration in tasks and request snapshots is rejected without sanitizing user data',()=>{
  for(const repeatDays of [-1,1.5,3651,'7'])for(const inPool of [false,true]){const s=state(),t=task({repeatDays});if(inPool)s.pool=[request({taskBackup:t})];else s.tasks=[t];assert.throws(()=>M.validate(s,now));}
});
test('repeat intervals use calendar days across leap months, years and DST transitions',()=>{
  for(const [input,n,expected] of [['2028-02-28',1,'2028-02-29'],['2028-02-28',2,'2028-03-01'],['2026-12-31',7,'2027-01-07'],['2026-03-29',1,'2026-03-30'],['2026-10-25',1,'2026-10-26']])assert.equal(M.addDays(input,n),expected);
  const {execFileSync}=require('node:child_process');assert.equal(execFileSync(process.execPath,['-e',"const M=require('./app/src/main/assets/model.js');process.stdout.write(M.addDays('2026-03-29',1)+' '+M.addDays('2026-10-25',1))"],{env:{...process.env,TZ:'Europe/Berlin'}}).toString(),'2026-03-30 2026-10-26');
});
