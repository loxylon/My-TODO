const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../app/src/main/assets/model.js');
const now=new Date('2026-10-27T10:00:00+03:00').getTime();
const task=(extra={})=>({id:'task',title:'Проверить документы',date:'2026-10-27',project:'',scheduled:true,done:false,rewarded:false,source:'',reminder:0,...extra});
const request=(extra={})=>({id:'request',title:'Проверить документы',tags:[],enabled:true,cooldownHours:0,lastSelected:0,...extra});
function state(){return {...M.initial(),auto:false,overdueCheckDay:'2026-10-26'};}
test('calendar removes past dots without deleting tasks history or changing future planning',()=>{
  const s=state();s.tasks=[task({date:'2026-10-26',done:true}),task({id:'today'}),task({id:'future',date:'2026-10-28',project:'work',scheduled:true}),task({id:'undated',date:'2026-10-28',project:'work',scheduled:false})];const raw=JSON.stringify(s);
  assert.deepEqual(M.calendarCounts(s,'2026-10-27'),{'2026-10-27':1,'2026-10-28':1});assert.deepEqual(M.calendarCounts(s,'2026-10-28'),{'2026-10-28':1});assert.deepEqual(M.calendarCounts(s,'2026-10-29'),{});assert.equal(JSON.stringify(s),raw);assert.equal(M.tasksOnDate(s,'2026-10-26')[0].done,true);
});
test('every newly overdue task is excluded from random selection, including a previously enabled source request',()=>{
  const s=state();s.auto=true;s.tasks=[task({date:'2026-10-26'}),task({id:'from-request',date:'2026-10-26',source:'request'})];s.pool=[request()];assert.equal(M.moveOverdue(s,now),2);assert.equal(s.pool.length,2);assert.ok(s.pool.every(p=>!p.enabled));assert.ok(s.pool.every(p=>M.isOverdueRequest(s,p)));assert.equal(M.rotate(s,now+10*M.HOUR),null);assert.equal(s.tasks.length,0);
  s.pool[0].enabled=true;const t=M.select(s,now+10*M.HOUR,()=>0);assert.ok(t);assert.equal(t.overdueDate,'2026-10-26');
});
test('ordinary overdue tasks keep identity and original date but cannot use manual return',()=>{
  const s=state();s.projects=[{id:'work',name:'Работа'}];s.tasks=[task({date:'2026-10-25',project:'work',repeatDays:3,customNote:'сохранить'})];M.moveOverdue(s,now);const p=s.pool[0];const t=M.scheduleRequest(s,p.id,'2026-10-27',now);assert.equal(t.overdueDate,'2026-10-25');assert.equal(M.taskOverdueDate(s,t),'2026-10-25');assert.equal(t.requestOrigin,false);assert.throws(()=>M.returnToRequests(s,t.id,now));
  M.moveOverdue(s,now+24*M.HOUR);assert.equal(s.pool[0].enabled,false);assert.equal(s.pool[0].overdueDate,'2026-10-25');assert.equal(s.pool[0].taskBackup.customNote,'сохранить');s.pool[0].enabled=true;const picked=M.select(s,now+24*M.HOUR);assert.equal(picked.id,'task');assert.equal(picked.project,'work');assert.equal(picked.repeatDays,3);
  const copy=M.prepareImport(JSON.parse(JSON.stringify(s)),now+24*M.HOUR);assert.equal(copy.tasks[0].overdueDate,'2026-10-25');M.moveOverdue(copy,now+48*M.HOUR);assert.equal(copy.pool[0].overdueDate,'2026-10-25');assert.equal(copy.pool[0].enabled,false);assert.equal(copy.pool[0].taskBackup.requestBackup,undefined);
});
test('returning an originally selected request keeps one queue entry and obeys the shared tag cooldown',()=>{
  const s=state();s.overdueCheckDay=M.day(now);s.tags=[{id:'tag',name:'дом',hours:72}];s.pool=[request({tags:['tag']})];const t=M.select(s,now);t.title='Обновлённое название';t.repeatDays=7;const returned=M.returnToRequests(s,t.id,now);assert.equal(returned.id,'request');assert.equal(s.tasks.length,0);assert.equal(s.pool.length,1);assert.deepEqual(returned.tags,['tag']);assert.equal(M.availability(s,returned,now).kind,'cooldown');assert.equal(returned.lastSelected,0);assert.equal(returned.taskBackup.repeatDays,7);assert.equal(s.xp,0);assert.equal(M.select(s,now),null);const picked=M.select(s,now+72*M.HOUR);assert.equal(picked.id,t.id);assert.equal(picked.title,'Обновлённое название');assert.equal(M.select(s,now+72*M.HOUR),null);
});
test('ordinary personal and planned project tasks cannot be returned to requests',()=>{
  for(const extra of [{},{project:'work',date:'2026-10-30'}]){const s=state();s.projects=[{id:'work',name:'Работа'}];s.tasks=[task({...extra,rewarded:true,customField:'kept'})];s.xp=42;const raw=JSON.stringify(s);assert.equal(M.wasOriginalRequest(s,s.tasks[0]),false);assert.throws(()=>M.returnToRequests(s,'task',now));assert.equal(JSON.stringify(s),raw);}
});
test('returning a manually scheduled request restores its tags and original queue identity',()=>{
  const s=state();s.overdueCheckDay=M.day(now);s.tags=[{id:'tag',name:'дом',hours:24}];s.pool=[request({enabled:false,tags:['tag']})];const t=M.scheduleRequest(s,'request','2026-10-27',now);const p=M.returnToRequests(s,t.id,now);assert.equal(p.id,'request');assert.deepEqual(p.tags,['tag']);assert.equal(p.enabled,true);assert.equal(s.pool.length,1);assert.equal(s.tasks.length,0);assert.equal(p.taskBackup.requestBackup,undefined);assert.equal(p.taskBackup.manualRequest,undefined);
});
test('a newly generated repeat is not an original request and undo still removes it',()=>{
  const s=state();s.overdueCheckDay=M.day(now);s.tasks=[task({repeatDays:2})];M.complete(s,'task',now);const next=s.tasks[1];assert.throws(()=>M.returnToRequests(s,next.id,now));assert.equal(s.tasks.length,2);M.complete(s,'task',now);assert.equal(s.tasks.length,1);assert.equal(s.pool.length,0);assert.equal(s.xp,8);
});
test('return rejects missing or completed tasks without modifying data; invalid overdue backup dates are rejected',()=>{
  const s=state();s.tasks=[task({done:true})];const raw=JSON.stringify(s);assert.throws(()=>M.returnToRequests(s,'missing',now));assert.throws(()=>M.returnToRequests(s,'task',now));assert.equal(JSON.stringify(s),raw);
  for(const pool of [false,true]){const bad=state(),t=task({overdueDate:'2026-02-30'});if(pool)bad.pool=[request({taskBackup:t})];else bad.tasks=[t];assert.throws(()=>M.validate(bad,now));}
});
test('old active overdue tasks are recognized from their queued origin or manual snapshot without migration',()=>{
  for(const manual of [false,true]){const s=state(),origin=request({overdueDate:'2026-10-20'});s.tasks=[task({source:'request',...(manual?{requestBackup:origin,manualRequest:true}:{})})];if(!manual)s.pool=[origin];const raw=JSON.stringify(s);assert.equal(M.taskOverdueDate(s,s.tasks[0],'2026-10-27'),'2026-10-20');assert.equal(JSON.stringify(s),raw);}
});
test('a legacy request marked only with the overdue tag keeps the same status after manual scheduling and JSON',()=>{
  const s=state();s.overdueCheckDay=M.day(now);s.tags=[{id:'late',name:'Просроченные',hours:0}];s.pool=[request({tags:['late'],enabled:false})];assert.equal(M.isOverdueRequest(s,s.pool[0]),true);const t=M.scheduleRequest(s,'request','2026-10-28',now);assert.equal(M.taskOverdueDate(s,t,'2026-10-27'),'2026-10-27');const copy=M.validate(JSON.parse(JSON.stringify(s)),now);assert.equal(M.taskOverdueDate(copy,copy.tasks[0],'2026-10-28'),'2026-10-27');M.complete(copy,t.id,now);assert.equal(copy.tasks[0].overdueDate,'2026-10-27');
});
