const {test,expect}=require('@playwright/test');

test.beforeEach(async({page})=>{await page.clock.install({time:new Date('2026-10-27T10:00:00+03:00')});await page.goto('/');});

test('choosing one request pauses its whole tag, and untagged requests share their own two-day clock',async({page})=>{
  await page.evaluate(()=>{
    const s=Model.initial(),p=(id,tags)=>({id,title:id,tags,enabled:true,cooldownHours:0,lastSelected:0,queuedAt:Date.now()-Model.HOUR,requestOrigin:true});
    s.auto=false;s.tags=[{id:'home',name:'дом',hours:24}];s.pool=[p('a',['home']),p('b',['home']),p('c',[]),p('d',[])];localStorage.setItem('mytodo',JSON.stringify(s));
  });await page.reload();await page.evaluate(()=>Math.random=()=>0);
  await page.getByRole('button',{name:'Выбрать одну сейчас',exact:false}).click();
  await expect(page.locator('[data-availability="b"]')).toContainText('Доступна с');await expect(page.locator('[data-availability="c"]')).toContainText('Можно выбрать');
  await page.getByRole('button',{name:'Выбрать одну сейчас',exact:false}).click();
  await expect(page.locator('[data-availability="d"]')).toContainText('Доступна с');
  await expect(page.locator('[data-availability="b"]')).toContainText('КД группы 24 ч');
  const clocks=await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('mytodo'));return [s.tagLastSelected.home,s.untaggedLastSelected];});expect(clocks[0]).toBeGreaterThan(0);expect(clocks[1]).toBeGreaterThan(0);
  await page.reload();await expect(page.locator('[data-availability="b"]')).toContainText('Доступна с');await expect(page.locator('[data-availability="d"]')).toContainText('Доступна с');
});

test('new rank is celebrated once while old XP and no-farming rules remain intact',async({page})=>{
  await page.evaluate(()=>{const s=Model.initial();s.auto=false;s.xp=99;s.tasks=[{id:'goal',title:'Закончить дело',date:Model.day(),scheduled:true,project:'',source:'',done:false,rewarded:false,reminder:0}];localStorage.setItem('mytodo',JSON.stringify(s));});await page.reload();
  await page.getByRole('button',{name:'Выполнить Закончить дело',exact:true}).click();
  const panel=page.locator('#levelUp');await expect(panel).toBeVisible();await expect(panel).toContainText('НОВЫЙ РАНГ');await expect(panel).toContainText('Искра');await expect(panel).toContainText('Уровень 2 · 107 XP');await expect(panel.locator('.level-confetti i')).toHaveCount(16);
  await page.getByRole('button',{name:'Продолжить'}).click();await expect(panel).toHaveCount(0);await page.locator('#showDone').click();await page.getByRole('button',{name:'Вернуть Закончить дело',exact:true}).click();await page.getByRole('button',{name:'Выполнить Закончить дело',exact:true}).click();
  await expect(page.locator('#levelUp')).toHaveCount(0);await expect(page.locator('#footerRank')).toContainText('107 XP');await page.reload();await expect(page.locator('#level')).toHaveText('2');
});
