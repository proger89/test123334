import { test, expect, type Page } from "@playwright/test";

async function unfinishedService(page: Page) {
  await page.goto("/");
  await page
    .locator(".scenario-list article")
    .filter({ hasText: "Сервис и свободный проход" })
    .getByRole("button")
    .click();
  await page.getByRole("button", { name: "Начать смену", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Прервать смену", exact: true }).click();
}

const exercise = (page: Page, title: string) =>
  page
    .locator(".practice-cards article")
    .filter({ hasText: title })
    .getByRole("button");

test("разбор второго сценария сразу открыт и объяснение не исчезает", async ({ page }) => {
  await page.goto("/");
  await page.locator(".scenario-list article")
    .filter({ hasText: "Багаж без владельца" })
    .getByRole("button").click();
  await page.getByRole("button", { name: "Начать смену", exact: true }).click();
  await page.getByRole("button", { name: /Не трогать вещь/ }).click();
  await page.getByRole("button", { name: /По связи сообщить начальнику поезда/ }).click();
  await expect(page.getByRole("heading", { name: "Смена пройдена" })).toBeVisible();
  const note = page.getByText("Обращение завершено автоматически.");
  await expect(note).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(note).toBeVisible();
  await expect(page.getByRole("heading", { name: "Как складывается результат" })).toBeVisible();
  await expect(page.locator(".result-evaluation")).toContainText("Лояльность 65/100");
  await expect(page.locator(".result-evaluation")).toContainText("Безопасность 100/100");
  await expect(page.locator(".result-evaluation")).toContainText("Общение с пассажиром");
});

test("зачёт ниже ста очков даёт второй уровень", async ({ page }) => {
  await page.goto("/");
  await page.locator(".scenario-list article")
    .filter({ hasText: "Сервис и свободный проход" })
    .getByRole("button").click();
  await page.getByRole("button", { name: "Проверка", exact: true }).click();
  await page.getByRole("button", { name: "Начать смену", exact: true }).click();
  await page.getByRole("button", { name: /Прошу прощения за неудобство/ }).click();
  await page.getByRole("button", { name: /Проверить доступные места/ }).click();
  await page.getByRole("button", { name: /Предложить свободное место/ }).click();
  await page.getByRole("button", { name: "Сообщить начальнику поезда и инженеру.", exact: true }).click();
  await page.getByRole("button", { name: /Вернуться к пассажиру с подтверждённой/ }).click();
  await page.getByRole("button", { name: /Багаж в проходе/ }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: /Багаж в проходе/ }).click();
  await page.getByRole("button", { name: /Спросить, кому принадлежит/ }).click();
  await page.getByRole("button", { name: /Немедленно уберите свой чемодан/ }).click();
  await expect(page.getByRole("heading", { name: "Смена пройдена" })).toBeVisible();
  await expect(page.locator(".result-score")).toContainText("89/100");
  await expect(page.locator(".result-evaluation")).toContainText("Лояльность 65/100");
  await page.getByRole("button", { name: "Мой прогресс", exact: true }).click();
  await expect(page.locator(".stats > div").filter({ hasText: "Уровень" })).toContainText("2");
});

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
    const finish = page.getByRole("button", { name: "Прервать смену", exact: true });
    await expect(finish).toHaveCSS("background-color", "rgb(198, 47, 62)");
    await page
      .getByRole("button", { name: /Прошу прощения за неудобство/ })
      .click();
    page.once("dialog", dialog => dialog.dismiss());
    await finish.click();
    await expect(page.getByRole("button", { name: /Проверить доступные места/ })).toBeVisible();
    page.once("dialog", dialog => dialog.accept());
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
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Прервать упражнение" }).click();
  await page.getByRole("button", { name: "К разбору смены" }).click();
  await exercise(page, "Что сделать в первую очередь").click();
  await expect(
    page.getByRole("heading", {
      name: "Что сделать в первую очередь",
      exact: true,
    }),
  ).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Прервать упражнение" }).click();
});
