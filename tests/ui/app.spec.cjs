const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{await page.goto('/');});
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
test('tag rules, exclusion, random selection and cooldown survive restart',async({page})=>{
  await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.getByRole('button',{name:'Теги и правила cooldown'}).click();
  await page.getByRole('button',{name:'Создать тег'}).click();await page.getByLabel('НАЗВАНИЕ БЕЗ #').fill('здоровье');await page.getByLabel('COOLDOWN, ЧАСЫ',{exact:true}).fill('48');await page.getByRole('button',{name:'Сохранить тег'}).click();await page.getByRole('button',{name:'Закрыть',exact:true}).click();
  await page.getByRole('button',{name:'Добавить регулярное дело'}).click();await page.getByLabel('НАЗВАНИЕ',{exact:true}).fill('Прогулка без телефона');await page.getByLabel('СОБСТВЕННЫЙ COOLDOWN, ЧАСЫ').fill('0');await page.getByRole('button',{name:'#здоровье · 2 д'}).click();await page.getByRole('button',{name:'Добавить в регулярные · +5 XP'}).click();
  await expect(page.locator('#pool')).toContainText('#здоровье');await expect(page.locator('#pool')).toContainText('cooldown 2 д');
  await page.locator('[data-pool]').first().click();await page.getByRole('switch',{name:'Участвует в выборе'}).click();await page.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.locator('#pool')).toContainText('Исключено');
  await page.reload();await expect(page.locator('#pool')).toContainText('Исключено');
  await page.locator('[data-pool]').first().click();await page.getByRole('switch',{name:'Участвует в выборе'}).click();await page.getByRole('button',{name:'Сохранить',exact:true}).click();await page.getByRole('button',{name:'Выбрать одно сейчас',exact:false}).click();
  await expect(page.locator('#tasks .task-title')).toHaveText('Прогулка без телефона');await expect(page.locator('#pool')).toContainText('Уже в делах');
  await page.getByRole('button',{name:'Выполнить Прогулка без телефона',exact:true}).click();await expect(page.locator('#pool')).toContainText('Через');
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
