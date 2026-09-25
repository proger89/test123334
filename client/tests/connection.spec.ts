import { test, expect } from "@playwright/test";
test("после краткого обрыва уведомления восстанавливаются и сообщение исчезает", async ({
  page,
  context,
}) => {
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith("/api/v1/notifications") && r.ok(),
    ),
    page.goto("/"),
  ]);
  await expect(
    page.getByRole("button", { name: "Редактор", exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await expect(
    page.getByRole("status").filter({ hasText: "Нет связи" }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(
    page.getByRole("status").filter({ hasText: "Нет связи" }),
  ).toHaveCount(0, { timeout: 15000 });
  await page.getByRole("button", { name: "Рейтинг", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Рейтинг", exact: true }),
  ).toBeVisible();
});
test("единичный сбой фонового запроса не оставляет вечную ошибку", async ({
  page,
}) => {
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith("/api/v1/notifications") && r.ok(),
    ),
    page.goto("/"),
  ]);
  await expect(
    page.getByRole("button", { name: "Редактор", exact: true }),
  ).toBeVisible();
  let failed = false;
  await page.route("**/api/v1/notifications", async (route) => {
    if (!failed) {
      failed = true;
      await route.abort("connectionreset");
    } else await route.continue();
  });
  await expect(
    page.getByRole("status").filter({ hasText: "Нет связи с сервером" }),
  ).toBeVisible({ timeout: 12000 });
  await expect(
    page.getByRole("status").filter({ hasText: "Нет связи с сервером" }),
  ).toHaveCount(0, { timeout: 15000 });
});
test("смена сохраняет серверный срок после обрыва и возвращения", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page
    .locator(".scenario-list article")
    .filter({ hasText: "Похожая вещь" })
    .getByRole("button")
    .click();
  await page.getByRole("button", { name: "Проверка", exact: true }).click();
  await page.getByRole("button", { name: "Начать смену", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ваше действие" }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.waitForTimeout(37000);
  await context.setOffline(false);
  await expect(
    page.getByText("Критическая ошибка", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole("status").filter({ hasText: "Нет связи" }),
  ).toHaveCount(0);
});

test("после обновления токена отклонённое действие повторяется один раз", async ({
  page,
}) => {
  await page.goto("/");
  let rejected = false;
  const bodies: string[] = [];
  await page.route("**/api/v1/attempts", async (route) => {
    bodies.push(route.request().postData()!);
    if (!rejected) {
      rejected = true;
      // APIRequestContext omits the browser's trusted same-origin metadata.
      // Obtain an actual CSRF rejection, then deliver it to the browser client.
      const rejection = await page.request.post(route.request().url(), {
        headers: { Accept: "application/json", "X-CSRF-TOKEN": "expired" },
        data: JSON.parse(route.request().postData()!),
      });
      expect(rejection.status()).toBe(419);
      await route.fulfill({response: rejection});
    } else await route.continue();
  });
  await page
    .locator(".scenario-list article")
    .filter({ hasText: "Похожая вещь" })
    .getByRole("button")
    .click();
  await page.getByRole("button", { name: "Начать смену", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ваше действие" }),
  ).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toBe(bodies[1]);
});
