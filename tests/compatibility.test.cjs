const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../app/src/main/assets/model.js');
const now=new Date('2026-10-21T12:00:00Z').getTime();
function expectedRecords(input){
  const s=structuredClone(input),pending=[...s.pool,...s.tasks.map(t=>t.requestBackup).filter(Boolean)];
  while(pending.length){const p=pending.pop();p.cooldownHours=0;if(p.taskBackup?.requestBackup)pending.push(p.taskBackup.requestBackup);}
  return s;
}
for(const version of ['1.0.0','1.1.0','1.2.0','1.3.0']){
  test(`JSON ${version}: migration and restore preserve every task, request, project, tag, date and rank`,()=>{
    const input=require(`./fixtures/backups/v${version}.json`),expected=expectedRecords(input);
    for(const operation of [M.validate,M.prepareImport]){
      const restored=operation(structuredClone(input),now);
      assert.equal(restored.schema,3);
      for(const key of ['tasks','pool','projects','tags','xp','theme','intervalHours','auto'])assert.deepEqual(restored[key],expected[key],`${version}: ${key}`);
      const before=structuredClone(restored);M.reconcile(restored,now,()=>0);
      assert.deepEqual(restored,before,'first launch must not move or select existing work');
      assert.deepEqual(M.validate(JSON.parse(JSON.stringify(restored)),now),restored,'export and import must round trip');
      assert.equal(M.moveOverdue(restored,now+24*M.HOUR),{'1.0.0':1,'1.1.0':2,'1.2.0':0,'1.3.0':2}[version],'normal overdue processing resumes the next day');
    }
  });
}
test('importing a current-version backup also preserves overdue items until the next local day',()=>{
  const s=M.initial();s.tasks=[{id:'old',title:'Старое дело',date:'2026-10-20',project:'',done:false,reminder:0}];s.overdueCheckDay='2026-10-20';s.lastRotation=0;
  const restored=M.prepareImport(s,now);M.reconcile(restored,now);assert.equal(restored.tasks[0].id,'old');assert.equal(restored.pool.length,0);
  M.reconcile(restored,now+24*M.HOUR);assert.equal(restored.tasks.length,0);assert.equal(restored.pool[0].taskBackup.id,'old');
});
test('cooldown is zero without tags even for old requests, and uses the longest assigned tag only',()=>{
  const s=M.initial(),p={id:'p',title:'Просьба',enabled:true,tags:[],cooldownHours:999,lastSelected:now};s.pool=[p];
  assert.equal(M.cooldown(s,p),0);assert.equal(M.eligible(s,p,now),true);p.lastSelected=now+M.HOUR;assert.equal(M.eligible(s,p,now),true);p.lastSelected=now;
  s.tags=[{id:'short',name:'короткий',hours:1},{id:'long',name:'длинный',hours:24}];p.tags=['short','long'];
  assert.equal(M.cooldown(s,p),24*M.HOUR);assert.equal(M.eligible(s,p,now),false);p.tags=['short'];assert.equal(M.cooldown(s,p),M.HOUR);
});
test('eligibility has an exact boundary, respects exclusions and pending work, and does not delay new requests',()=>{
  const s=M.initial(),p={id:'p',title:'Просьба',enabled:true,tags:['tag'],cooldownHours:0,lastSelected:now};s.tags=[{id:'tag',name:'тег',hours:1}];s.pool=[p];
  const a=M.availability(s,p,now+M.HOUR-1000);assert.equal(a.kind,'cooldown');assert.equal(a.availableAt,now+M.HOUR);assert.equal(a.remainingMs,1000);
  assert.equal(M.availability(s,p,now+M.HOUR).kind,'ready');p.enabled=false;assert.equal(M.availability(s,p,now+M.HOUR).kind,'excluded');p.enabled=true;
  s.tasks=[{id:'t',source:'p',done:false}];assert.equal(M.availability(s,p,now+M.HOUR).kind,'pending');s.tasks=[];p.lastSelected=0;assert.equal(M.availability(s,p,now).kind,'ready');
});
test('future or invalid backup format is rejected instead of initializing an empty database',()=>{
  assert.throws(()=>M.prepareImport({...M.initial(),schema:99},now));assert.throws(()=>M.prepareImport({...M.initial(),tasks:null},now));
});
