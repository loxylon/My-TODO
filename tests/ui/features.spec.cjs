const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{await page.clock.install({time:new Date('2026-10-21T10:00:00+03:00')});await page.goto('/');});

test('top pull opens deadline curtain; red dots, details and JSON survive reload',async({page})=>{
  await page.mouse.move(200,110);await page.mouse.down();await page.mouse.move(201,195,{steps:4});await page.mouse.up();
  await expect(page.locator('#deadlineCurtain')).toHaveClass(/open/);
  await page.locator('#deadlineAdd').click();
  await page.getByLabel('НАЗВАНИЕ',{exact:true}).fill('Подготовить заявку');
  await page.locator('#eventDescription').fill('Первая строка подробностей\nВторая строка с адресом и документами');
  await page.getByLabel('ДЕДЛАЙН · НЕОБЯЗАТЕЛЬНО').fill('2026-10-25T18:00');
  await page.locator('#eventLead').fill('2');await page.locator('#eventLeadUnit').selectOption('days');
  await page.locator('#eventForm button[type="submit"]').click();
  await expect(page.locator('.deadline-unscheduled .deadline-card')).toHaveCount(1);
  await expect(page.locator('.deadline-unscheduled .deadline-card-description')).toHaveCSS('white-space','nowrap');
  await page.locator('.deadline-unscheduled .deadline-card').click();
  await expect(page.locator('.event-details')).toContainText('Вторая строка с адресом');
  await page.getByRole('button',{name:'Закрыть',exact:true}).click();
  for(let i=0;i<4;i++){
    await page.locator('#deadlineAdd').click();await page.getByLabel('НАЗВАНИЕ',{exact:true}).fill('Событие '+i);
    await page.getByLabel('ДЕНЬ В КАЛЕНДАРЕ · НЕОБЯЗАТЕЛЬНО').fill('2026-10-26');
    await page.locator('#eventForm button[type="submit"]').click();
  }
  await expect(page.locator('[data-event-date="2026-10-26"] .deadline-dots .large')).toHaveCount(1);
  await page.locator('[data-event-date="2026-10-26"]').click();
  await expect(page.locator('#deadlineDayPanel .deadline-card')).toHaveCount(4);
  await page.getByRole('button',{name:'Свернуть события дня'}).click();
  await expect(page.locator('#deadlineDayPanel')).toHaveCount(0);
  const backup=await page.evaluate(()=>JSON.parse(localStorage.getItem('mytodo')));
  expect(backup.events).toHaveLength(5);expect(backup.events[0].remindBeforeHours).toBe(48);
  await page.getByRole('button',{name:'Закрыть события'}).click();await expect(page.locator('#deadlineCurtain')).not.toBeVisible();
  await page.reload();await page.locator('#deadlinePull').click();
  await expect(page.locator('.deadline-unscheduled .deadline-card')).toHaveCount(1);
  await expect(page.locator('[data-event-date="2026-10-26"] .deadline-dots .large')).toHaveCount(1);
  await page.locator('#deadlineClose').click();await page.getByRole('button',{name:'Настройки',exact:true}).click();
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Сохранить резервную копию',exact:false}).click();
  const download=await pending,exported=JSON.parse(require('node:fs').readFileSync(await download.path(),'utf8'));
  expect(exported.events).toEqual(backup.events);expect(exported.graphs).toEqual([]);
});

test('project graph grows upward, links generations and attaches project tasks',async({page})=>{
  await page.getByRole('button',{name:'Открыть меню'}).click();await page.getByRole('button',{name:'Новый проект',exact:true}).click();
  await page.getByLabel('НАЗВАНИЕ ПРОЕКТА').fill('Мой план');await page.getByRole('button',{name:'Создать проект · +1 XP'}).click();
  await page.locator('#addTask').click();await page.getByLabel('ЧТО ХОЧЕТСЯ СДЕЛАТЬ').fill('Существующее дело');await page.getByRole('button',{name:'Добавить дело · +1 XP'}).click();
  await page.locator('#graphMode').click();await expect(page.locator('#graphDialog')).toBeVisible();
  await page.locator('#graphAdd').click();await page.getByLabel('ИДЕЯ').fill('Корень');await page.getByRole('button',{name:'Создать вершину'}).click();
  const root=await page.evaluate(()=>state.graphs[0].nodes[0].id);
  await page.locator('#graphAdd').click();await page.getByLabel('ИДЕЯ').fill('Ветка');await page.getByRole('button',{name:'Создать вершину'}).click();
  const branch=await page.evaluate(()=>state.graphs[0].nodes[1].id);
  await page.locator(`[data-child="${branch}"]`).click();await page.getByLabel('ИДЕЯ').fill('Верхушка');await page.getByRole('button',{name:'Создать вершину'}).click();
  const leaf=await page.evaluate(()=>state.graphs[0].nodes[2].id);
  await page.locator(`[data-link="${root}"]`).click();await page.locator(`[data-link="${leaf}"]`).click();
  expect(await page.evaluate(()=>state.graphs[0].edges.length)).toBe(3);
  expect(await page.evaluate(({root,leaf})=>Model.graphLayout(state.graphs[0]).positions[root].y>Model.graphLayout(state.graphs[0]).positions[leaf].y,{root,leaf})).toBe(true);
  await expect(page.locator('.graph-edges > path')).toHaveCount(3);
  await page.locator(`[data-graph-node="${leaf}"] .graph-node-text`).fill('Новая верхушка');
  await page.locator('#graphAdd').click();await expect(page.locator(`[data-graph-node="${leaf}"] .graph-node-text`)).toHaveValue('Новая верхушка');
  await page.getByRole('button',{name:'Закрыть',exact:true}).click();
  await page.locator(`[data-node-tasks="${root}"]`).click();await page.locator('#graphExistingTask').selectOption({label:'Существующее дело'});await page.locator('#graphAttach').click();
  await expect(page.locator('.node-task-list')).toContainText('Существующее дело');
  await page.locator('#graphNewTask').click();await page.getByLabel('ЧТО ХОЧЕТСЯ СДЕЛАТЬ').fill('Создано в графе');await page.getByRole('button',{name:'Добавить дело · +1 XP'}).click();
  expect(await page.evaluate(()=>state.graphs[0].nodes[0].taskIds.length)).toBe(2);
  await page.locator('#graphClose').click();await expect(page.locator('#graphDialog')).not.toBeVisible();
  const project=await page.evaluate(()=>state.projects[0].id);
  await page.reload();await page.getByRole('button',{name:'Открыть меню'}).click();await page.locator(`[data-screen="${project}"]`).click();
  await page.locator('#graphMode').click();await expect(page.locator('.graph-node')).toHaveCount(3);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('mytodo')).graphs[0].nodes[0].taskIds.length)).toBe(2);
  const backup=await page.evaluate(()=>JSON.stringify(state));await page.locator('#graphClose').click();
  await page.evaluate(raw=>receiveBackup(raw),backup);await page.getByRole('button',{name:'Подтвердить',exact:true}).click();
  expect(await page.evaluate(()=>state.graphs[0].nodes[0].taskIds.length)).toBe(2);
});

test('project list places dated tasks first in date order',async({page})=>{
  await page.getByRole('button',{name:'Открыть меню'}).click();await page.getByRole('button',{name:'Новый проект',exact:true}).click();
  await page.getByLabel('НАЗВАНИЕ ПРОЕКТА').fill('Даты');await page.getByRole('button',{name:'Создать проект · +1 XP'}).click();
  for(const [title,date] of [['Без даты',''],['Позже','2026-11-02'],['Раньше','2026-10-28']]){
    await page.locator('#addTask').click();await page.getByLabel('ЧТО ХОЧЕТСЯ СДЕЛАТЬ').fill(title);
    if(date)await page.getByLabel('ДАТА · НЕОБЯЗАТЕЛЬНО',{exact:true}).fill(date);
    await page.getByRole('button',{name:'Добавить дело · +1 XP'}).click();
  }
  await expect(page.locator('#tasks .task-title')).toHaveText(['Раньше','Позже','Без даты']);
});

test('a tall graph opens at its root and can be scrolled to the top',async({page})=>{
  await page.evaluate(()=>{
    const s=Model.initial();s.projects=[{id:'long-project',name:'Длинный план'}];
    let parent='';for(let i=0;i<8;i++)parent=Model.addGraphNode(s,'long-project','Шаг '+i,parent).id;
    localStorage.setItem('mytodo',JSON.stringify(s));
  });
  await page.reload();await page.getByRole('button',{name:'Открыть меню'}).click();await page.locator('[data-screen="long-project"]').click();await page.locator('#graphMode').click();
  const start=await page.evaluate(()=>({scroll:document.getElementById('graphScroll').scrollTop,max:document.getElementById('graphScroll').scrollHeight-document.getElementById('graphScroll').clientHeight}));
  expect(start.max).toBeGreaterThan(300);expect(start.scroll).toBeGreaterThan(start.max-2);
  await page.locator('#graphScroll').evaluate(el=>el.scrollTop=0);
  expect(await page.locator('#graphScroll').evaluate(el=>el.scrollTop)).toBe(0);
  await expect(page.locator('.graph-node').last()).toBeInViewport();
});
