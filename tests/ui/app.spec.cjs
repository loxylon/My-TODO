const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{await page.clock.install({time:new Date('2026-10-21T10:00:00+03:00')});await page.goto('/');});
test('create, edit, complete and reload without losing XP or task data',async({page})=>{
  await page.getByRole('button',{name:'Добавить дело',exact:false}).click();
  await page.getByLabel('ЧТО ХОЧЕТСЯ СДЕЛАТЬ').fill('Почитать 20 минут');
  await page.getByRole('button',{name:'Добавить дело · +5 XP'}).click();
  await expect(page.locator('.task-title')).toHaveText('Почитать 20 минут');
  await page.getByRole('button',{name:'Выполнить Почитать 20 минут',exact:true}).click();
  await expect(page.locator('#footerRank')).toContainText('25 XP');
  await page.getByRole('button',{name:'Выполнено · 1',exact:false}).click();
  await page.getByRole('button',{name:'Вернуть Почитать 20 минут',exact:true}).click();
  await page.getByRole('button',{name:'Выполнить Почитать 20 минут',exact:true}).click();
  await expect(page.locator('#footerRank')).toContainText('25 XP');
  await page.reload();await expect(page.locator('#footerRank')).toContainText('25 XP');
});
test('project lists stay separate and can be renamed',async({page})=>{
  await page.getByRole('button',{name:'Открыть меню'}).click();await page.getByRole('button',{name:'Новый проект',exact:true}).click();
  await page.getByLabel('НАЗВАНИЕ ПРОЕКТА').fill('Моя книга');await page.getByRole('button',{name:'Создать проект · +5 XP'}).click();
  await expect(page.locator('h1')).toHaveText('Моя книга.');
  await page.locator('#addTask').click();await page.getByLabel('ЧТО ХОЧЕТСЯ СДЕЛАТЬ').fill('Написать главу');await page.getByRole('button',{name:'Добавить дело · +5 XP'}).click();
  await expect(page.locator('.task-title')).toHaveText('Написать главу');
  await page.getByRole('button',{name:'Действия с проектом'}).click();await page.getByLabel('НАЗВАНИЕ ПРОЕКТА').fill('Книга');await page.getByRole('button',{name:'Сохранить',exact:true}).click();
  await expect(page.locator('h1')).toHaveText('Книга.');
  await page.getByRole('button',{name:'Открыть меню'}).click();await page.locator('[data-screen=""]').click();await expect(page.locator('.task')).toHaveCount(0);
});
test('request tags and exclusions persist; completion removes the request and undo restores it',async({page})=>{
  await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.getByRole('button',{name:'Теги и правила cooldown'}).click();
  await page.getByRole('button',{name:'Создать тег'}).click();await page.getByLabel('НАЗВАНИЕ БЕЗ #').fill('здоровье');await page.getByLabel('COOLDOWN, ЧАСЫ',{exact:true}).fill('48');await page.getByRole('button',{name:'Сохранить тег'}).click();await page.getByRole('button',{name:'Закрыть',exact:true}).click();
  await page.getByRole('button',{name:'Добавить просьбу'}).click();await page.getByLabel('НАЗВАНИЕ',{exact:true}).fill('Прогулка без телефона');await page.getByLabel('СОБСТВЕННЫЙ COOLDOWN, ЧАСЫ').fill('0');await page.getByRole('button',{name:'#здоровье · 2 д'}).click();await page.getByRole('button',{name:'Добавить просьбу · +5 XP'}).click();
  await expect(page.locator('#pool')).toContainText('#здоровье');await expect(page.locator('#pool')).toContainText('cooldown 2 д');
  await page.locator('[data-pool]').first().click();await page.getByRole('switch',{name:'Участвует в выборе'}).click();await page.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.locator('#pool')).toContainText('Исключено');
  await page.reload();await expect(page.locator('#pool')).toContainText('Исключено');
  await page.locator('[data-pool]').first().click();await page.getByRole('switch',{name:'Участвует в выборе'}).click();await page.getByRole('button',{name:'Сохранить',exact:true}).click();await page.getByRole('button',{name:'Выбрать одну сейчас',exact:false}).click();
  await expect(page.locator('#tasks .task-title')).toHaveText('Прогулка без телефона');await expect(page.locator('#pool')).toContainText('Уже в делах');
  await page.getByRole('button',{name:'Выполнить Прогулка без телефона',exact:true}).click();await expect(page.locator('#pool .pool-item')).toHaveCount(0);await page.reload();await expect(page.locator('#pool .pool-item')).toHaveCount(0);await page.getByRole('button',{name:'Выполнено · 1',exact:false}).click();await page.getByRole('button',{name:'Вернуть Прогулка без телефона',exact:true}).click();await expect(page.locator('#pool')).toContainText('Уже в делах');
});
test('themes, 60 ranks, reminder persistence and safe backup import',async({page})=>{
  await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.getByRole('button',{name:'Paper',exact:true}).click();await page.getByRole('button',{name:'Закрыть',exact:true}).click();
  await page.locator('#addTask').click();await page.getByLabel('ЧТО ХОЧЕТСЯ СДЕЛАТЬ').fill('<img src=x onerror=alert(1)>');await page.getByLabel('НАПОМНИТЬ · НЕОБЯЗАТЕЛЬНО').fill('2030-10-21T15:30');await page.getByRole('button',{name:'Добавить дело · +5 XP'}).click();
  await expect(page.locator('.task-title')).toHaveText('<img src=x onerror=alert(1)>');await expect(page.locator('#tasks img')).toHaveCount(0);
  await page.reload();await expect(page.locator('.reminder')).toBeVisible();await expect(page.locator('html')).toHaveCSS('--bg','#f5f3ee');
  await page.getByRole('button',{name:'Опыт и ранги'}).click();await expect(page.locator('.rank-row')).toHaveCount(60);await page.getByRole('button',{name:'Закрыть',exact:true}).click();
  const backup=await page.evaluate(()=>localStorage.getItem('mytodo'));
  await page.evaluate(raw=>receiveBackup(raw),backup);await page.getByRole('button',{name:'Подтвердить',exact:true}).click();await expect(page.locator('.task-title')).toHaveText('<img src=x onerror=alert(1)>');
  await page.evaluate(()=>receiveBackup('{"schema":99}'));await expect(page.locator('#toast')).toContainText('Неподдерживаемый формат');
});
test('mobile layout stays within viewport in all themes',async({page})=>{
  for(const theme of ['sage','dracula','nord','rose','paper','midnight']){
    await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.locator(`[data-theme="${theme}"]`).click();await page.getByRole('button',{name:'Закрыть',exact:true}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});

test('left drawer calendar marks future tasks and opens the selected day; all tasks arrive at midnight',async({page})=>{
  await page.clock.setSystemTime(new Date('2026-10-24T23:59:45+03:00'));
  await page.reload();
  for(const title of ['Забрать заказ','Отправить документы']){
    await page.locator('#addTask').click();await page.getByLabel('ЧТО ХОЧЕТСЯ СДЕЛАТЬ').fill(title);await page.getByLabel('ДАТА · НЕОБЯЗАТЕЛЬНО',{exact:true}).fill('2026-10-25');await page.getByRole('button',{name:'Добавить дело · +5 XP'}).click();
  }
  await expect(page.locator('#tasks .task')).toHaveCount(0);
  await page.getByRole('button',{name:'Открыть меню'}).click();
  const drawer=await page.locator('#navigation').boundingBox();expect(drawer.x).toBe(0);expect(drawer.y).toBe(0);expect(drawer.width).toBeLessThan(380);expect(drawer.height).toBe(915);
  const date=page.locator('[data-date="2026-10-25"]');await expect(date).toHaveAttribute('data-count','2');await expect(date.locator('.calendar-dots i')).toHaveCount(2);await date.click();
  await expect(page.locator('#navigation')).not.toBeVisible();await expect(page.locator('h1')).toContainText('25 октября');await expect(page.locator('#tasks .task')).toHaveCount(2);
  await page.locator('[data-edit]').first().click();await expect(page.getByLabel('ДАТА · НЕОБЯЗАТЕЛЬНО',{exact:true})).toHaveValue('2026-10-25');await page.getByRole('button',{name:'Закрыть',exact:true}).click();
  await page.getByRole('button',{name:'Открыть меню'}).click();await page.locator('[data-screen=""]').click();
  await expect(page.locator('#tasks .task')).toHaveCount(0);
  await page.clock.fastForward(30000);await expect(page.locator('#tasks .task')).toHaveCount(2);
  await page.reload();await expect(page.locator('#tasks .task')).toHaveCount(2);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('mytodo')).tasks.length)).toBe(2);
});

test('dated project tasks arrive in today together and retain their project',async({page})=>{
  await page.getByRole('button',{name:'Открыть меню'}).click();await page.getByRole('button',{name:'Новый проект',exact:true}).click();await page.getByLabel('НАЗВАНИЕ ПРОЕКТА').fill('Ремонт');await page.getByRole('button',{name:'Создать проект · +5 XP'}).click();
  await page.locator('#addTask').click();await page.getByLabel('ЧТО ХОЧЕТСЯ СДЕЛАТЬ').fill('Купить краску');await page.getByLabel('ДАТА · НЕОБЯЗАТЕЛЬНО',{exact:true}).fill('2026-10-22');await page.getByRole('button',{name:'Добавить дело · +5 XP'}).click();
  await expect(page.locator('#tasks')).toContainText('Купить краску');await page.getByRole('button',{name:'Открыть меню'}).click();await expect(page.locator('[data-date="2026-10-22"]')).toHaveAttribute('data-count','1');await page.locator('[data-screen=""]').click();await expect(page.locator('#tasks .task')).toHaveCount(0);
  await page.clock.setSystemTime(new Date('2026-10-22T10:00:00+03:00'));await page.reload();await expect(page.locator('#tasks')).toContainText('Купить краску');await expect(page.locator('#tasks')).toContainText('Ремонт');
  await page.getByRole('button',{name:'Открыть меню'}).click();await page.getByRole('button',{name:'▧ Ремонт 1'}).click();await expect(page.locator('#tasks .task')).toHaveCount(1);
});

test('calendar navigates across year boundaries and supports creating a task for the selected date',async({page})=>{
  await page.clock.setSystemTime(new Date('2026-12-21T10:00:00+03:00'));await page.reload();await page.getByRole('button',{name:'Открыть меню'}).click();await page.getByRole('button',{name:'Следующий месяц'}).click();await expect(page.locator('#currentMonth')).toContainText('январь 2027');
  await page.locator('[data-date="2027-01-05"]').click();await page.locator('#addTask').click();await expect(page.getByLabel('ДАТА · НЕОБЯЗАТЕЛЬНО',{exact:true})).toHaveValue('2027-01-05');await page.getByLabel('ЧТО ХОЧЕТСЯ СДЕЛАТЬ').fill('Проверить документы');await page.getByRole('button',{name:'Добавить дело · +5 XP'}).click();await expect(page.locator('#tasks .task')).toHaveCount(1);
  await page.getByRole('button',{name:'Открыть меню'}).click();await expect(page.locator('[data-date="2027-01-05"]')).toHaveAttribute('data-count','1');await page.getByRole('button',{name:'Закрыть меню'}).click();await expect(page.locator('#navigation')).not.toBeVisible();
});

test('updating a v1 installation preserves projects and XP and removes previously finished requests',async({page})=>{
  const fixture=require('../fixtures/v1-state.json');await page.evaluate(data=>localStorage.setItem('mytodo',JSON.stringify(data)),fixture);await page.reload();await expect(page.locator('#footerRank')).toContainText('210 XP');await expect(page.locator('html')).toHaveCSS('--bg','#f5f3ee');await expect(page.locator('#pool .pool-item')).toHaveCount(1);await expect(page.locator('#pool')).toContainText('Передать посылку');await expect(page.locator('#pool')).not.toContainText('Забрать книгу');await page.getByRole('button',{name:'Открыть меню'}).click();await expect(page.getByRole('button',{name:'▧ Ремонт 1'})).toBeVisible();
});

test('midnight moves unfinished dated tasks into requests with one overdue tag and no duplicates',async({page})=>{
  await page.clock.setSystemTime(new Date('2026-10-21T23:59:45+03:00'));
  const fixture=require('../fixtures/overdue-state.json');await page.evaluate(data=>localStorage.setItem('mytodo',JSON.stringify(data)),fixture);await page.reload();
  await expect(page.locator('#tasks .task')).toHaveCount(3);
  await page.clock.fastForward(30000);await expect(page.locator('#tasks .task')).toHaveCount(1);await expect(page.locator('#tasks')).toContainText('Дело сегодня');
  await expect(page.locator('#pool .pool-item')).toHaveCount(3);await expect(page.locator('#pool .chip').filter({hasText:'#просроченные'})).toHaveCount(3);await expect(page.locator('#footerRank')).toContainText('40 XP');
  await page.reload();await expect(page.locator('#pool .pool-item')).toHaveCount(3);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('mytodo')).tags.filter(t=>t.name==='просроченные').length)).toBe(1);
});

test('reopening moves old project work; picking and completing it retains project and request completion behavior',async({page})=>{
  await page.evaluate(()=>{const s=Model.initial();s.auto=false;s.projects=[{id:'repair',name:'Ремонт'}];s.tasks=[{id:'project-task',title:'Купить краску',date:'2026-10-20',project:'repair',scheduled:true,done:false,rewarded:false,reminder:0}];localStorage.setItem('mytodo',JSON.stringify(s));});await page.reload();
  await expect(page.locator('#tasks .task')).toHaveCount(0);await expect(page.locator('#pool')).toContainText('#просроченные');await expect(page.locator('#pool')).toContainText('Купить краску');
  await page.getByRole('button',{name:'Выбрать одну сейчас',exact:false}).click();await expect(page.locator('#tasks')).toContainText('Купить краску');await expect(page.locator('#tasks')).toContainText('Ремонт');
  await page.getByRole('button',{name:'Выполнить Купить краску',exact:true}).click();await expect(page.locator('#pool .pool-item')).toHaveCount(0);await expect(page.locator('#footerRank')).toContainText('20 XP');
  await page.getByRole('button',{name:'Выполнено · 1',exact:false}).click();await page.getByRole('button',{name:'Вернуть Купить краску',exact:true}).click();await expect(page.locator('#pool .pool-item')).toHaveCount(1);await expect(page.locator('#pool')).toContainText('#просроченные');
});
