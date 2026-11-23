const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../app/src/main/assets/model.js');
const now=new Date('2026-10-21T12:00:00Z').getTime();
function expectedRecords(input){
  const s=structuredClone(input),pending=[...s.pool,...s.tasks.map(t=>t.requestBackup).filter(Boolean)];
  while(pending.length){const p=pending.pop();p.cooldownHours=0;if(p.taskBackup?.requestBackup)pending.push(p.taskBackup.requestBackup);}
  return s;
}
for(const version of ['1.0.0','1.1.0','1.2.0','1.3.0','1.4.0','1.5.0','1.6.0','1.7.0']){
  test(`JSON ${version}: migration and restore preserve every task, request, project, tag, date and rank`,()=>{
    const input=require(`./fixtures/backups/v${version}.json`),expected=expectedRecords(input);
    for(const operation of [M.validate,M.prepareImport]){
      const restored=operation(structuredClone(input),now);
      assert.equal(restored.schema,3);
      for(const key of ['tasks','pool','projects','tags','xp','theme','intervalHours','auto'])assert.deepEqual(restored[key],expected[key],`${version}: ${key}`);
      const before=structuredClone(restored);M.reconcile(restored,now,()=>0);
      assert.deepEqual(restored,before,'first launch must not move or select existing work');
      assert.deepEqual(M.validate(JSON.parse(JSON.stringify(restored)),now),restored,'export and import must round trip');
      assert.equal(M.moveOverdue(restored,now+24*M.HOUR),{'1.0.0':1,'1.1.0':2,'1.2.0':0,'1.3.0':2,'1.4.0':3,'1.5.0':2,'1.6.0':2,'1.7.0':2}[version],'normal overdue processing resumes the next day');
    }
  });
}
test('importing a current-version backup also preserves overdue items until the next local day',()=>{
  const s=M.initial();s.tasks=[{id:'old',title:'Старое дело',date:'2026-10-20',project:'',done:false,reminder:0}];s.overdueCheckDay='2026-10-20';s.lastRotation=0;
  const restored=M.prepareImport(s,now);M.reconcile(restored,now);assert.equal(restored.tasks[0].id,'old');assert.equal(restored.pool.length,0);
  M.reconcile(restored,now+24*M.HOUR);assert.equal(restored.tasks.length,0);assert.equal(restored.pool[0].taskBackup.id,'old');
});
test('untagged requests share a two-day cooldown; tagged requests follow their tag clocks',()=>{
  const s=M.initial(),p={id:'p',title:'Просьба',enabled:true,tags:[],cooldownHours:999,lastSelected:now};s.pool=[p];
  assert.equal(M.cooldown(s,p),48*M.HOUR);assert.equal(M.eligible(s,p,now),true);s.untaggedLastSelected=now;assert.equal(M.eligible(s,p,now+48*M.HOUR-1),false);assert.equal(M.eligible(s,p,now+48*M.HOUR),true);
  s.tags=[{id:'short',name:'короткий',hours:1},{id:'long',name:'длинный',hours:24}];p.tags=['short','long'];
  s.tagLastSelected={short:now,long:now};assert.equal(M.cooldown(s,p),24*M.HOUR);assert.equal(M.eligible(s,p,now),false);p.tags=['short'];assert.equal(M.cooldown(s,p),M.HOUR);assert.equal(M.eligible(s,p,now+M.HOUR),true);
});
test('eligibility has an exact boundary, respects exclusions and pending work, and does not delay new requests',()=>{
  const s=M.initial(),p={id:'p',title:'Просьба',enabled:true,tags:['tag'],cooldownHours:0,lastSelected:now};s.tags=[{id:'tag',name:'тег',hours:1}];s.tagLastSelected.tag=now;s.pool=[p];
  const a=M.availability(s,p,now+M.HOUR-1000);assert.equal(a.kind,'cooldown');assert.equal(a.availableAt,now+M.HOUR);assert.equal(a.remainingMs,1000);
  assert.equal(M.availability(s,p,now+M.HOUR).kind,'ready');p.enabled=false;assert.equal(M.availability(s,p,now+M.HOUR).kind,'excluded');p.enabled=true;
  s.tasks=[{id:'t',source:'p',done:false}];assert.equal(M.availability(s,p,now+M.HOUR).kind,'pending');s.tasks=[];s.tagLastSelected.tag=0;assert.equal(M.availability(s,p,now).kind,'ready');
});
test('migration shares the latest old selection across requests of each tag and preserves current work',()=>{
  const s=M.initial();delete s.tagCooldownVersion;delete s.tagLastSelected;delete s.untaggedLastSelected;
  s.tags=[{id:'home',name:'дом',hours:24}];s.pool=[{id:'a',title:'A',enabled:true,tags:['home'],cooldownHours:0,lastSelected:now-2*M.HOUR},{id:'b',title:'B',enabled:true,tags:['home'],cooldownHours:0,lastSelected:now-M.HOUR},{id:'c',title:'C',enabled:true,tags:[],cooldownHours:0,lastSelected:now-3*M.HOUR}];
  const before=structuredClone(s.pool);M.validate(s,now);assert.deepEqual(s.pool,before);assert.equal(s.tagLastSelected.home,now-M.HOUR);assert.equal(s.untaggedLastSelected,now-3*M.HOUR);assert.equal(M.availability(s,s.pool[0],now).availableAt,now+23*M.HOUR);assert.equal(M.availability(s,s.pool[2],now).availableAt,now+45*M.HOUR);assert.equal(M.validate(JSON.parse(JSON.stringify(s)),now+M.HOUR).tagLastSelected.home,now-M.HOUR);
});
test('selecting one request pauses every request with its tag but leaves other groups independent',()=>{
  const s=M.initial(),make=(id,tags)=>({id,title:id,enabled:true,tags,cooldownHours:0,lastSelected:0,queuedAt:now-M.HOUR});
  s.tags=[{id:'home',name:'дом',hours:24},{id:'work',name:'работа',hours:72}];
  s.pool=[make('a',['home']),make('b',['home']),make('c',['work']),make('d',[])];
  assert.equal(M.select(s,now,()=>0).source,'a');assert.equal(M.availability(s,s.pool[1],now).availableAt,now+24*M.HOUR);
  assert.equal(M.eligible(s,s.pool[1],now),false);assert.equal(M.eligible(s,s.pool[2],now),true);assert.equal(M.eligible(s,s.pool[3],now),true);
  M.scheduleRequest(s,'d',M.day(now),now);s.pool.push(make('e',[]));assert.equal(M.availability(s,s.pool.at(-1),now).availableAt,now+48*M.HOUR);
  const mixed=make('mixed',['home','work']);s.pool.push(mixed);s.tagLastSelected.work=now-70*M.HOUR;
  assert.equal(M.availability(s,mixed,now).availableAt,now+24*M.HOUR);
  s.tagLastSelected.work=now;assert.equal(M.availability(s,mixed,now).availableAt,now+72*M.HOUR);
});
test('future or invalid backup format is rejected instead of initializing an empty database',()=>{
  assert.throws(()=>M.prepareImport({...M.initial(),schema:99},now));assert.throws(()=>M.prepareImport({...M.initial(),tasks:null},now));
  const missing=M.initial();delete missing.tagLastSelected;assert.throws(()=>M.validate(missing,now));
  const invalid=M.initial();invalid.tagLastSelected.home=-1;assert.throws(()=>M.validate(invalid,now));
});
