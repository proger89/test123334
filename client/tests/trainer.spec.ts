import path from 'node:path';
const evidence = path.resolve(import.meta.dirname, '../../tmp');
import { test, expect, Page } from '@playwright/test';

async function start(page: Page, title: string, check = false) {
  await page.getByRole('button', { name: 'Сценарии', exact: true }).click();
  await page.locator('article').filter({ hasText: title }).getByRole('button').click();
  if (check) await page.getByRole('button', { name: 'Проверка', exact: true }).click();
  await page.getByRole('button', { name: 'Начать смену', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ваше действие' })).toBeVisible();
}
async function security(page: Page) {
  await page.getByRole('button', { name: /Не трогать вещь/ }).click();
  await page.getByRole('button', { name: /По связи сообщить начальнику поезда и транспортной/ }).click();
  await page.getByRole('button', { name: /Завершить обращение/ }).click();
  await expect(page.getByText('100/100', {exact:true})).toBeVisible();
}

test('две смены, сохранение, испытание, достижения и три рейтинга', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const started=Date.now();
  await page.goto('/');
  await expect(page.getByRole('heading', {name:'Выберите учебную смену'})).toBeVisible();
  console.log('first_useful_screen_ms='+ (Date.now()-started));
  await page.getByRole('button', { name: 'Прогресс',exact:true }).click();
  await page.getByRole('button', { name: /Принять испытание/ }).click();
  await start(page,'Сервис и свободный проход',true);
  await page.getByRole('button',{name:/Прошу прощения за неудобство/}).click();
  await page.reload();
  await page.getByRole('button',{name:/Проверить доступные места/}).click();
  await page.getByRole('button',{name:/Предложить свободное место/}).click();
  await page.getByRole('button',{name:'Сообщить начальнику поезда и инженеру.',exact:true}).click();
  await page.getByRole('button',{name:/Вернуться к пассажиру с подтверждённой/}).click();
  await page.getByRole('button',{name:/Багаж в проходе/}).waitFor({timeout:30000});
  await page.getByRole('button',{name:/Багаж в проходе/}).click();
  await page.getByRole('button',{name:/Спросить, кому принадлежит/}).click();
  await page.getByRole('button',{name:/Пожалуйста, уберите чемодан/}).click();
  await expect(page.getByText('100/100',{exact:true})).toBeVisible();
  await expect(page.locator('a[href*="situations.pdf"]')).toHaveCount(8);
  await page.getByRole('button',{name:'Мой прогресс',exact:true}).click();
  await expect(page.getByText('Свободный проход',{exact:true})).toBeVisible();
  await start(page,'Похожая вещь',true);
  await security(page);
  await page.getByRole('button',{name:'Мой прогресс',exact:true}).click();
  await expect(page.getByText('Две смены',{exact:true})).toBeVisible();
  await expect(page.getByText(/Испытание выполнено/)).toBeVisible();
  await page.getByRole('button',{name:'Рейтинг',exact:true}).click();
  for (const scope of ['Моя бригада','Моё депо','Компания']) {
    await page.getByRole('button',{name:scope,exact:true}).click();
    await expect(page.locator('.rank-list .self')).toContainText('220');
  }
  expect(errors).toEqual([]);
});

test('критическая ошибка, обучение, правильная проверка',async({page})=>{
  await page.goto('/');
  await start(page,'Похожая вещь',true);
  await page.getByRole('button',{name:/Перенести вещь/}).click();
  await expect(page.getByText('Критическая ошибка',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Повторить обучение'}).click();
  await page.getByRole('button',{name:'Начать смену',exact:true}).click();
  await security(page);
  await start(page,'Похожая вещь',true);
  await security(page);
});

for (const width of [390,768,1366]) test('экран '+width,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto('/');
  await start(page,'Сервис и свободный проход');
  await page.getByRole('button',{name:'Пауза',exact:true}).click();
  await expect(page.getByText('Смена приостановлена',{exact:false})).toBeVisible();
  await page.reload();
  await expect(page.getByText('Смена приостановлена',{exact:false})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.locator('img').evaluateAll(images=>images.every(i=>(i as HTMLImageElement).complete&&(i as HTMLImageElement).naturalWidth>0))).toBe(true);
  await page.screenshot({path:path.join(evidence,'browser-artifacts/width-'+width+'.png'),fullPage:true});
});

test('сравнение с макетом и клавиатура',async({page})=>{
  await page.setViewportSize({width:1487,height:1058});
  await page.goto('/');
  await page.locator('article').filter({hasText:'Сервис и свободный проход'}).getByRole('button').click();
  await expect(page.getByRole('button',{name:'Назад',exact:true})).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button',{name:'Начать смену',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await start(page,'Сервис и свободный проход');
  await expect(page.locator('.passenger')).toBeVisible();
  await page.screenshot({path:path.join(evidence,'design-implementation.png')});
});

test('понятное сообщение при потере связи и восстановление смены',async({page,context})=>{
  await page.goto('/');
  await start(page,'Сервис и свободный проход');
  await page.getByRole('button',{name:'Пауза',exact:true}).click();
  await context.setOffline(true);
  await expect(page.getByRole('status').filter({hasText:'Нет связи'})).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole('status').filter({hasText:'Нет связи'})).toHaveCount(0);
  await expect(page.getByText('Смена приостановлена',{exact:false})).toBeVisible();
});
