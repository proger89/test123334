import { test, expect, type Page } from "@playwright/test";

async function unfinishedService(page: Page) {
  await page.goto("/");
  await page
    .locator(".scenario-list article")
    .filter({ hasText: "Сервис и свободный проход" })
    .getByRole("button")
    .click();
  await page.getByRole("button", { name: "Начать смену", exact: true }).click();
  await page.getByRole("button", { name: "Завершить", exact: true }).click();
}

const exercise = (page: Page, title: string) =>
  page
    .locator(".practice-cards article")
    .filter({ hasText: title })
    .getByRole("button");

for (const width of [390, 1366]) {
  test(`понятный разбор и заметное завершение на ширине ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page
      .locator(".scenario-list article")
      .filter({ hasText: "Сервис и свободный проход" })
      .getByRole("button")
      .click();
    await page
      .getByRole("button", { name: "Начать смену", exact: true })
      .click();
    const finish = page.getByRole("button", { name: "Завершить", exact: true });
    await expect(finish).toHaveCSS("background-color", "rgb(198, 47, 62)");
    await page
      .getByRole("button", { name: /Прошу прощения за неудобство/ })
      .click();
    await finish.click();
    const good = page.getByRole("region", { name: /Что получилось/ });
    const repeat = page.getByRole("region", { name: /Что стоит повторить/ });
    await expect(good).toContainText("Признать неудобство и извиниться");
    await expect(repeat).not.toContainText("Признать неудобство и извиниться");
    await expect(repeat).toContainText("Установить владельца багажа");
    expect((await good.boundingBox())!.y).toBeLessThan(
      (await repeat.boundingBox())!.y,
    );
    const decisions = page
      .locator("details")
      .filter({
        has: page
          .locator("summary")
          .filter({ hasText: "Решения и последствия" }),
      });
    await expect(decisions).not.toHaveAttribute("open");
    await decisions.locator("summary").click();
    await expect(decisions).toContainText("Вы признали неудобство");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `tmp/results-${width}.png`,
      fullPage: true,
    });
  });
}

test("незавершённое упражнение: видимое объяснение и возврат к сохранённой попытке", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await unfinishedService(page);
  await exercise(page, "Помочь без лишних обещаний").click();
  await page.getByRole("button", { name: "Пауза", exact: true }).click();
  await page.getByRole("button", { name: "К разбору смены" }).click();
  await exercise(page, "Что сделать в первую очередь").click();
  const dialog = page.getByRole("dialog", {
    name: "Есть незавершённое прохождение",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeInViewport();
  await expect(
    dialog.getByRole("button", { name: "Продолжить прохождение" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(exercise(page, "Что сделать в первую очередь")).toBeFocused();
  await exercise(page, "Что сделать в первую очередь").click();
  await dialog.getByRole("button", { name: "Продолжить прохождение" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Помочь без лишних обещаний",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Упражнение приостановлено")).toBeVisible();
  await page.getByRole("button", { name: "Завершить упражнение" }).click();
  await page.getByRole("button", { name: "К разбору смены" }).click();
  await exercise(page, "Что сделать в первую очередь").click();
  await expect(
    page.getByRole("heading", {
      name: "Что сделать в первую очередь",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Завершить упражнение" }).click();
});
