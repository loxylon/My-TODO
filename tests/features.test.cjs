const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../app/src/main/assets/model.js');

test('old backups acquire empty event and graph collections without changing existing work',()=>{
  for(const version of ['1.0.0','1.1.0','1.2.0','1.3.0','1.4.0','1.5.0','1.6.0','1.7.0']){
    const old=require(`./fixtures/backups/v${version}.json`),snapshot=structuredClone(old);
    const migrated=M.validate(old,Date.UTC(2026,10,23));
    assert.deepEqual(migrated.events,[]);assert.deepEqual(migrated.graphs,[]);
    assert.deepEqual(migrated.tasks.map(t=>t.id),snapshot.tasks.map(t=>t.id));
    assert.deepEqual(migrated.pool.map(p=>p.id),snapshot.pool.map(p=>p.id));
    assert.deepEqual(migrated.projects,snapshot.projects);
  }
});

test('event dots, reminder lead time and JSON round trip preserve descriptions',()=>{
  const s=M.initial(),deadline=new Date('2026-12-02T15:00:00').getTime();
  s.events=[{id:'event-1',title:'Отправить заявку',description:'Подготовить документы\nПроверить номер',date:'',deadline,remindBeforeHours:48,notified:false}];
  assert.equal(M.eventDate(s.events[0]),M.day(deadline));
  assert.equal(M.eventReminderAt(s.events[0]),deadline-48*M.HOUR);
  assert.equal(M.eventCounts(s)[M.day(deadline)],1);
  assert.deepEqual(M.validate(JSON.parse(JSON.stringify(s))).events,s.events);
});

test('project tasks with dates sort first, undated tasks retain their order',()=>{
  const s=M.initial();s.projects.push({id:'work',name:'Работа'});
  s.tasks=[{id:'free1',project:'work',date:'2026-01-01',scheduled:false},{id:'late',project:'work',date:'2026-12-30',scheduled:true},{id:'free2',project:'work',date:'2026-01-01',scheduled:false},{id:'early',project:'work',date:'2026-12-01',scheduled:true}];
  assert.deepEqual(M.sortedProjectTasks(s,'work').map(t=>t.id),['early','late','free1','free2']);
});

test('graph grows upward, supports direct senior links and rejects cycles',()=>{
  const s=M.initial();s.projects.push({id:'work',name:'Работа'});
  const root=M.addGraphNode(s,'work','Основа'),a=M.addGraphNode(s,'work','Направление A',root.id),b=M.addGraphNode(s,'work','Направление B',root.id),leaf=M.addGraphNode(s,'work','Итог',a.id);
  M.addGraphEdge(s,'work',b.id,leaf.id);
  const graph=M.graphFor(s,'work'),layout=M.graphLayout(graph,390,600);
  assert.equal(graph.edges.length,4);assert.ok(layout.positions[root.id].y>layout.positions[a.id].y);assert.ok(layout.positions[a.id].y>layout.positions[leaf.id].y);
  assert.throws(()=>M.addGraphEdge(s,'work',leaf.id,root.id),/нижней вершины/);
  assert.throws(()=>M.addGraphEdge(s,'work',a.id,leaf.id),/уже соединены/);
  assert.deepEqual(M.validate(JSON.parse(JSON.stringify(s))).graphs,s.graphs);
});

test('layout reorders crossed leaves beneath their parents',()=>{
  const graph={project:'work',nodes:['root','left','right','right-leaf','left-leaf'].map(id=>({id,text:id,taskIds:[]})),edges:[{from:'root',to:'left'},{from:'root',to:'right'},{from:'right',to:'right-leaf'},{from:'left',to:'left-leaf'}]};
  const layout=M.graphLayout(graph);
  assert.deepEqual(layout.layers[1],['left','right']);
  assert.deepEqual(layout.layers[2],['left-leaf','right-leaf']);
});

test('graph task references survive movement to overdue requests and backup restore',()=>{
  const s=M.initial();s.projects.push({id:'work',name:'Работа'});
  const root=M.addGraphNode(s,'work','Корень');
  s.tasks.push({id:'task',title:'Выполнить',date:'2026-11-21',scheduled:true,project:'work',done:false,reminder:0,rewarded:false,source:''});
  M.attachGraphTask(s,'work',root.id,'task');
  s.overdueCheckDay='2026-11-21';M.moveOverdue(s,new Date('2026-11-23T10:00:00').getTime());
  assert.equal(s.tasks.length,0);assert.equal(s.pool[0].taskBackup.id,'task');
  assert.deepEqual(M.validate(JSON.parse(JSON.stringify(s))).graphs,s.graphs);
});

test('backup rejects malformed events and graph edges before replacing current data',()=>{
  const s=M.initial();s.events=[{id:'bad',title:'X',description:'',date:'2026-02-30',deadline:0,remindBeforeHours:0,notified:false}];
  assert.throws(()=>M.validate(s),/Некорректное событие/);
  s.events=[];s.projects.push({id:'work',name:'Работа'});s.graphs=[{project:'work',nodes:[{id:'one',text:'Один',taskIds:[]},{id:'two',text:'Два',taskIds:[]}],edges:[{from:'one',to:'two'},{from:'two',to:'one'}]}];
  assert.throws(()=>M.validate(s),/цикл/);
});
