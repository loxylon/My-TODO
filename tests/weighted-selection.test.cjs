const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../app/src/main/assets/model.js');
const now=new Date('2026-10-27T10:00:00+03:00').getTime();
const pool=(id,extra={})=>({id,title:id,tags:[],enabled:true,cooldownHours:0,lastSelected:0,...extra});
function state(){return {...M.initial(),queueClockStartedAt:now,overdueCheckDay:M.day(now),auto:false};}
for(const vector of require('./fixtures/weighted-selection.json'))test('shared Android/JS weights: '+vector.name,()=>{
  const s=state();s.queueClockStartedAt=vector.now;
  for(let i=0;i<vector.candidates.length;i++){
    const c=vector.candidates[i],id='p'+i;s.tags.push({id:'tag'+i,name:'тег'+i,hours:c.cooldownMillis/M.HOUR});s.pool.push(pool(id,{queuedAt:c.queuedAt,enabled:c.enabled,lastSelected:c.lastSelected,tags:['tag'+i]}));
    if(c.pending)s.tasks.push({id:'task'+i,source:id,done:false});
  }
  assert.equal(M.select(s,vector.now,()=>vector.draw)?.source||null,vector.expected<0?null:'p'+vector.expected);
});
test('waiting three days versus one day gives exactly 75/25 selection probability and proportional draws',()=>{
  const s=state();s.pool=[pool('old',{queuedAt:now-72*M.HOUR}),pool('new',{queuedAt:now-24*M.HOUR})];const stats=M.selectionStats(s,now);assert.equal(stats.old.probability,.75);assert.equal(stats.new.probability,.25);
  const count={old:0,new:0};for(let i=0;i<1000;i++){s.tasks=[];count[M.select(s,now,()=>(i+.5)/1000).source]++;}assert.deepEqual(count,{old:750,new:250});assert.equal(s.xp,0);
});
test('waiting time survives editing pauses JSON restore and process reload; manual return starts new waiting',()=>{
  const s=state();s.pool=[pool('old',{queuedAt:now-48*M.HOUR})];s.pool[0].title='Новое название';s.pool[0].enabled=false;const restored=M.prepareImport(JSON.parse(JSON.stringify(s)),now);assert.equal(restored.pool[0].queuedAt,now-48*M.HOUR);assert.equal(M.selectionStats(restored,now).old.probability,0);restored.pool[0].enabled=true;
  const t=M.scheduleRequest(restored,'old',M.day(now),now);const p=M.returnToRequests(restored,t.id,now+M.HOUR);assert.equal(p.queuedAt,now+M.HOUR);assert.equal(M.queuedSince(restored,p),now+M.HOUR);assert.equal(M.validate(JSON.parse(JSON.stringify(restored)),now+M.HOUR).pool[0].queuedAt,p.queuedAt);
});
test('legacy backups start one shared queue clock without inventing missing dates or changing user records',()=>{
  const s=state();delete s.queueClockStartedAt;s.pool=[pool('a'),pool('b')];const original=structuredClone(s.pool);M.validate(s,now);assert.deepEqual(s.pool,original);assert.equal(s.queueClockStartedAt,now);const later=M.validate(JSON.parse(JSON.stringify(s)),now+24*M.HOUR);assert.equal(later.queueClockStartedAt,now);const stats=M.selectionStats(later,now+24*M.HOUR);assert.equal(stats.a.probability,.5);assert.equal(stats.b.probability,.5);assert.equal(stats.a.estimated,true);
});
test('older entries gain probability over newborn entries continuously; eligibility gates still win',()=>{
  const s=state();s.pool=[pool('old',{queuedAt:now-10*M.HOUR}),pool('new',{queuedAt:now})];const first=M.selectionStats(s,now),later=M.selectionStats(s,now+10*M.HOUR);assert.ok(first.old.probability>.999);assert.ok(first.new.probability>0);assert.ok(Math.abs(later.old.probability-2/3)<1e-12);s.pool[0].enabled=false;assert.equal(M.selectionStats(s,now).new.probability,1);
});
test('overdue rollover creates a fresh waiting timestamp while keeping exclusion and original overdue date',()=>{
  const s=state();s.overdueCheckDay=M.day(now-24*M.HOUR);s.tasks=[{id:'old-task',title:'Просроченное',date:M.day(now-24*M.HOUR),project:'',scheduled:true,done:false,reminder:0}];M.moveOverdue(s,now);assert.equal(s.pool[0].queuedAt,now);assert.equal(s.pool[0].enabled,false);assert.equal(s.pool[0].overdueDate,M.day(now-24*M.HOUR));assert.equal(M.selectionStats(s,now+24*M.HOUR)[s.pool[0].id].probability,0);
});
test('queue timestamps in active requests and archived snapshots reject invalid values',()=>{
  for(const value of [-1,Infinity,'old',1.5,8640000000000001])for(const where of ['root','pool','archive']){
    const s=state();if(where==='root')s.queueClockStartedAt=value;else if(where==='pool')s.pool=[pool('p',{queuedAt:value})];else s.tasks=[{id:'done',title:'Готово',date:M.day(now),project:'',done:true,source:'p',reminder:0,requestBackup:pool('p',{queuedAt:value})}];assert.throws(()=>M.validate(s,now));
  }
});
