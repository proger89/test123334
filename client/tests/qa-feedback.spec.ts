import { test, expect, type Page } from "@playwright/test";

async function startSecurity(page: Page) {
  await page.getByRole("button", { name: "Сценарии", exact: true }).click();
  await page
    .locator(".scenario-list article")
    .filter({ hasText: "Похожая вещь" })
    .getByRole("button")
    .click();
  await page.getByRole("button", { name: "Проверка", exact: true }).click();
  await page.getByRole("button", { name: "Начать смену", exact: true }).click();
}

test("новый результат не скрыт старой ошибкой, достижения и профиль", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await startSecurity(page);
  await page.getByRole("button", { name: /Перенести вещь/ }).click();
  await expect(
    page.getByText("Критическая ошибка", { exact: true }),
  ).toBeVisible();
  await startSecurity(page);
  await page.getByRole("button", { name: /По связи сообщить/ }).click();
  await page
    .getByRole("button", { name: /Не трогать вещь и предупредить/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Обязательные действия выполнены" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Завершить обращение и открыть разбор" })
    .click();
  await expect(page.getByText("100/100", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  const safety = page
    .locator(".skill-card")
    .filter({ hasText: "Безопасность и приоритеты" });
  await expect(safety.locator("strong")).toHaveText("100%");
  await safety.locator("summary").click();
  await expect(safety).toContainText("Попыток с критической ошибкой: 1");
  await expect(page.locator(".achievement.locked")).toHaveCount(2);
  await expect(page.locator(".achievement.earned")).toHaveCount(2);
  for (const width of [390,768,1366]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path:`../tmp/qa-progress-${width}.png`,fullPage:true});
  }

  await page.getByRole("button", { name: "Мой профиль" }).click();
  await expect(
    page.getByText("Основные баллы: 100", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Профиль", exact: true }),
  ).toBeVisible();
  await page
    .locator(".achievement.earned")
    .filter({ hasText: "Внимание к обстоятельствам" })
    .getByRole("button")
    .click();
  await expect(page.getByText("100/100", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("реальные 90 секунд: предупреждение, истечение и рейтинг", async ({
  page,
}) => {
  test.skip(
    !!process.env.PUBLIC_SMOKE,
    "Нельзя выдавать баллы на публичном сервере",
  );
  test.setTimeout(125000);
  await page.goto("/#progress");
  await page
    .getByText("Ускоренная демонстрация временных баллов", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Показать истечение за 90 секунд" })
    .click();
  await expect(
    page.locator(".stats").getByText("20", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Уведомления", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Скоро истекут 20 временных баллов/ }),
  ).toBeVisible({ timeout: 45000 });
  await expect(
    page.getByRole("button", { name: /Срок 20 временных баллов истёк/ }),
  ).toBeVisible({ timeout: 75000 });
  await page.getByRole("button", { name: "Рейтинг", exact: true }).click();
  await expect(page.locator(".rank-list .self")).toContainText("0");
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await expect(page.locator(".stats div").nth(1)).toContainText("0");
  await expect(page.locator(".stats div").nth(0)).toContainText("0");
  await expect(page.locator(".stats div").nth(2)).toContainText("1");
});
