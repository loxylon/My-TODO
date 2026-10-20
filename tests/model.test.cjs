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
test('pending tasks prevent duplicates even after cooldown expires',()=>{
  const s=M.initial();s.pool=[pool('one',{cooldownHours:0})];assert.ok(M.select(s,100*M.HOUR));assert.equal(M.select(s,200*M.HOUR),null);M.complete(s,s.tasks[0].id);assert.ok(M.select(s,200*M.HOUR));
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
