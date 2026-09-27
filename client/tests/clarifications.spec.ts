import { test, expect } from "@playwright/test";

test("профиль получает новый результат из другой вкладки", async ({
  page,
  context,
}) => {
  await page.goto("/#profile");
  await expect(
    page.getByText("Основные баллы: 0", { exact: false }),
  ).toBeVisible();
  const game = await context.newPage();
  await game.goto("/");
  await game
    .locator(".scenario-list article")
    .filter({ hasText: "Багаж без владельца" })
    .getByRole("button")
    .click();
  await game.getByRole("button", { name: "Проверка", exact: true }).click();
  await game.getByRole("button", { name: "Начать смену", exact: true }).click();
  await game.getByRole("button", { name: /По связи сообщить/ }).click();
  await game.getByRole("button", { name: /Не трогать вещь/ }).click();
  await expect(game.getByText("100/100", { exact: true })).toBeVisible();
  await page.bringToFront();
  await expect(
    page.getByText("Основные баллы: 100", { exact: false }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".achievement.earned")).toHaveCount(2);
  await expect(page.locator(".achievement.locked")).toHaveCount(2);
  await expect(
    page.getByRole("heading", { name: "Последние смены" }),
  ).toBeVisible();
  for (const width of [390, 768, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `../tmp/clarifications-profile-${width}.png`,
      fullPage: true,
    });
  }
});

test("новая сборка предлагается без автоматической перезагрузки", async ({
  page,
}) => {
  await page.route("**/build.json", (route) =>
    route.fulfill({ json: { id: "another-build" } }),
  );
  await page.goto("/#profile");
  await expect(
    page.getByText("Доступно обновление.", { exact: false }),
  ).toBeVisible({ timeout: 40000 });
  await expect(
    page.getByRole("button", { name: "Обновить страницу", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#profile$/);
});

test("главная страница перепроверяется, отсутствующий файл не возвращает HTML", async ({
  request,
}) => {
  const html = await request.get("/");
  expect(html.headers()["cache-control"]).toContain("no-cache");
  const build = await request.get("/build.json");
  expect(build.headers()["cache-control"]).toContain("no-store");
  expect(typeof (await build.json()).id).toBe("string");
  expect((await request.get("/assets/missing.js")).status()).toBe(404);
});

test("обновление не прерывает начатую смену", async ({ page }) => {
  await page.route("**/build.json", (route) =>
    route.fulfill({ json: { id: "another-build" } }),
  );
  await page.goto("/");
  await page
    .locator(".scenario-list article")
    .filter({ hasText: "Багаж без владельца" })
    .getByRole("button")
    .click();
  await page.getByRole("button", { name: "Проверка", exact: true }).click();
  await page.getByRole("button", { name: "Начать смену", exact: true }).click();
  await expect(
    page.getByText("Завершите прохождение, затем обновите страницу."),
  ).toBeVisible({ timeout: 34000 });
  await expect(
    page.getByRole("button", { name: "Обновить страницу", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /По связи сообщить/ }).click();
  await page.getByRole("button", { name: /Не трогать вещь/ }).click();
  await expect(page.getByText("100/100", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Обновить страницу", exact: true }),
  ).toBeVisible();
});
