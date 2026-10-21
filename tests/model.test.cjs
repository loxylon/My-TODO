const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../app/src/main/assets/model.js');
const pool=(id,extra={})=>({id,title:id,tags:[],cooldownHours:24,enabled:true,lastSelected:0,...extra});
test('first selection, cooldown boundary, and random choice among eligible only',()=>{
  const s=M.initial(),now=100*M.HOUR;s.pool=[pool('disabled',{enabled:false}),pool('cooling',{lastSelected:now-23*M.HOUR}),pool('available'),pool('also-available')];
  assert.equal(M.select(s,now,()=>.99).source,'also-available');assert.equal(s.pool[3].lastSelected,now);assert.equal(s.tasks[0].date,M.day(now));
  assert.equal(M.eligible(s,s.pool[1],now),false);assert.equal(M.eligible(s,s.pool[1],now+M.HOUR),true);
});
test('multiple tags use longest cooldown, including task override',()=>{
  const s=M.initial();s.tags=[{id:'a',name:'a',hours:48},{id:'b',name:'b',hours:72}];const p=pool('one',{tags:['a','b'],cooldownHours:0});assert.equal(M.cooldown(s,p),72*M.HOUR);p.cooldownHours=96;assert.equal(M.cooldown(s,p),96*M.HOUR);
});
test('pending requests prevent duplicates and completed requests leave the queue permanently',()=>{
  const s=M.initial();s.pool=[pool('one',{cooldownHours:0})];assert.ok(M.select(s,100*M.HOUR));assert.equal(M.select(s,200*M.HOUR),null);M.complete(s,s.tasks[0].id);assert.equal(s.pool.length,0);assert.equal(M.select(s,200*M.HOUR),null);assert.equal(s.tasks[0].done,true);
});
test('automatic rotation inserts one task after a long absence, not a backlog',()=>{
  const s=M.initial();s.pool=[pool('a'),pool('b'),pool('c')];M.rotate(s,100*M.HOUR,()=>0);assert.equal(s.tasks.length,1);M.rotate(s,101*M.HOUR);assert.equal(s.tasks.length,1);M.rotate(s,300*M.HOUR,()=>0);assert.equal(s.tasks.length,2);assert.equal(s.lastRotation,300*M.HOUR);
});
test('disabled automation and excluded items are never chosen automatically',()=>{
  const s=M.initial();s.pool=[pool('a',{enabled:false})];assert.equal(M.rotate(s,100*M.HOUR),null);s.pool[0].enabled=true;s.auto=false;assert.equal(M.rotate(s,200*M.HOUR),null);assert.equal(s.tasks.length,0);
});
test('completion rewards only once across repeated check/uncheck and persistence',()=>{
  const s=M.initial();s.pool=[pool('a')];const t=M.select(s,100*M.HOUR);assert.equal(M.complete(s,t.id),20);assert.equal(M.complete(s,t.id),0);const restored=M.validate(JSON.parse(JSON.stringify(s)));assert.equal(M.complete(restored,t.id),0);assert.equal(restored.xp,20);
});
test('all 60 ranks have increasing thresholds and last rank is bounded',()=>{
  assert.equal(M.rankNames.length,60);for(let i=1;i<60;i++)assert.ok(M.threshold(i)>M.threshold(i-1));assert.equal(M.rank(99).index,0);assert.equal(M.rank(100).index,1);assert.equal(M.rank(1e8).index,59);assert.equal(M.rank(1e8).next,null);
});
test('backup validation rejects malformed and unsafe state',()=>{
  assert.deepEqual(M.validate(M.initial()),M.initial());for(const bad of [null,{}, {...M.initial(),xp:-1},{...M.initial(),intervalHours:0},{...M.initial(),pool:[pool('../unsafe')]}])assert.throws(()=>M.validate(bad));
});
test('excluded status survives JSON round trip with tag membership',()=>{
  const s=M.initial();s.tags=[{id:'home',name:'дом',hours:72}];s.pool=[pool('plant',{enabled:false,tags:['home']})];const copy=M.validate(JSON.parse(JSON.stringify(s)));assert.equal(copy.pool[0].enabled,false);assert.deepEqual(copy.pool[0].tags,['home']);
});
test('undo completion restores request metadata without farming XP or duplicating it',()=>{
  const s=M.initial();s.tags=[{id:'home',name:'дом',hours:72}];s.pool=[pool('one',{tags:['home']})];const t=M.select(s,100*M.HOUR);M.complete(s,t.id);
  assert.equal(s.pool.length,0);const copy=M.validate(JSON.parse(JSON.stringify(s)));M.complete(copy,t.id);assert.equal(copy.pool.length,1);assert.deepEqual(copy.pool[0].tags,['home']);assert.equal(M.eligible(copy,copy.pool[0],200*M.HOUR),false);M.complete(copy,t.id);assert.equal(copy.pool.length,0);assert.equal(copy.xp,20);
});
test('version 1 backup migrates once while preserving tasks projects tags theme and experience',()=>{
  const fixture=require('./fixtures/v1-state.json'),s=M.validate(structuredClone(fixture));assert.equal(s.schema,2);assert.equal(s.xp,fixture.xp);assert.deepEqual(s.projects,fixture.projects);assert.deepEqual(s.tags,fixture.tags);assert.equal(s.theme,'paper');assert.equal(s.tasks.length,3);assert.deepEqual(s.pool.map(p=>p.id),['pending-request']);assert.equal(s.tasks[0].requestBackup.id,'done-request');assert.equal(M.isDated(s.tasks[2]),false);assert.deepEqual(M.validate(structuredClone(s)),s);
});
test('all planned tasks become today tasks together on their date, including tasks in a project',()=>{
  const s=M.initial();s.auto=false;
  s.tasks=[{id:'a',date:'2026-10-25',project:'',done:false},{id:'b',date:'2026-10-25',project:'work',scheduled:true,done:false},{id:'c',date:'2026-10-25',project:'work',done:false},{id:'d',date:'2026-10-26',project:'',done:false}];
  assert.equal(M.todayTasks(s,'2026-10-24').length,0);assert.deepEqual(M.todayTasks(s,'2026-10-25').map(t=>t.id),['a','b']);assert.deepEqual(M.todayTasks(s,'2026-10-26').map(t=>t.id),['a','b','d']);assert.equal(s.tasks[1].project,'work');assert.equal(s.tasks.length,4);
});
test('calendar counts recorded tasks across projects without counting undated project tasks',()=>{
  const s=M.initial();s.tasks=[{date:'2026-10-25',project:'',done:false},{date:'2026-10-25',project:'work',scheduled:true,done:false},{date:'2026-10-26',project:'work',done:false},{date:'2026-10-27',project:'',done:true}];assert.deepEqual(M.calendarCounts(s),{'2026-10-25':2,'2026-10-27':1});assert.equal(M.tasksOnDate(s,'2026-10-25').length,2);
});
test('calendar starts on Monday and handles leap years and year boundaries',()=>{
  const oct=M.calendarCells(2026,9);assert.equal(oct.length,42);assert.equal(oct[0].date,'2026-09-28');assert.equal(oct[3].date,'2026-10-01');const feb=M.calendarCells(2028,1);assert.ok(feb.some(c=>c.date==='2028-02-29'&&c.inMonth));const dec=M.calendarCells(2026,11);assert.ok(dec.some(c=>c.date.startsWith('2027-01')));assert.equal(M.validDay('2026-02-29'),false);assert.equal(M.validDay('2028-02-29'),true);
});
