import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
const evidence = path.resolve(
  import.meta.dirname,
  "../../tmp/browser-artifacts",
);

async function start(page: Page, scenario = "Похожая вещь", check = true) {
  await page.getByRole("button", { name: "Сценарии", exact: true }).click();
  await page
    .locator(".scenario-list article")
    .filter({ hasText: scenario })
    .getByRole("button")
    .click();
  await page
    .getByRole("button", { name: check ? "Проверка" : "Обучение", exact: true })
    .click();
  await page.getByRole("button", { name: "Начать смену", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ваше действие" }),
  ).toBeVisible();
}

test("ошибка → упражнение → сохранение → самостоятельная проверка; TC005 TC017 TC020", async ({
  page,
}) => {
  const errors: string[] = [];
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "randomUUID", { value: undefined });
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await start(page);
  await page.getByRole("button", { name: /Перенести вещь/ }).click();
  await expect(
    page.getByText("Критическая ошибка", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Отработать ошибку", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Чья это вещь?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Пауза", exact: true }).click();
  await page.reload();
  await expect(page.getByText("Упражнение приостановлено")).toBeVisible();
  await page
    .getByRole("button", { name: "Продолжить упражнение", exact: true })
    .click();
  const answer = page.getByRole("button", {
    name: /Не трогать сумку и сообщить/,
  });
  // Tab through actual focusable controls and activate the answer without a mouse.
  for (
    let i = 0;
    i < 25 && !(await answer.evaluate((el) => el === document.activeElement));
    i++
  )
    await page.keyboard.press("Tab");
  await expect(answer).toBeFocused();
  expect(
    await answer.evaluate((el) => getComputedStyle(el).outlineStyle),
  ).not.toBe("none");
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: /Предупредить пассажиров, не трогать/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "В упражнении получилось" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "В исходной смене" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(evidence, "practice-result.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Что стоит повторить" }),
  ).toBeVisible();
  await expect(
    page.locator(".competency").filter({ hasText: "Безопасность" }),
  ).toContainText("Критическая ошибка");
  await expect(page.locator(".stats")).toContainText("0Основные баллы");
  await page.getByRole("button", { name: /Чья это вещь\?.*Выполнено/ }).click();
  await page
    .getByRole("button", {
      name: "Пройти самостоятельную проверку",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Проверка", exact: true }),
  ).toHaveClass("active");
  await page.getByRole("button", { name: "Начать смену", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Пауза", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: /Не трогать вещь и предупредить/ })
    .click();
  await page.getByRole("button", { name: /По связи сообщить/ }).click();
  await page.getByRole("button", { name: "Завершить обращение." }).click();
  await expect(page.getByText("100/100", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Рекомендуемые упражнения" }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const width of [390, 768])
  test("упражнение на экране " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await start(page, "Сервис и свободный проход", false);
    await page.getByRole("button", { name: "Завершить", exact: true }).click();
    await page
      .locator(".practice-cards article")
      .filter({ hasText: "Что сделать в первую очередь" })
      .getByRole("button")
      .click();
    await page.getByRole("button", { name: "Пауза", exact: true }).click();
    await expect(page.getByText("Упражнение приостановлено")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: path.join(evidence, `practice-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "К разбору смены" }).click();
    await page.getByRole("button", { name: "Сценарии", exact: true }).click();
    await page
      .getByRole("button", { name: "Продолжить прохождение", exact: true })
      .click();
    await expect(page.getByText("Упражнение приостановлено")).toBeVisible();
    await page.getByRole("button", { name: "Продолжить упражнение" }).click();
    for (const answer of [
      /Сказать пассажиру, что вернётесь/,
      /Спросить, чья это сумка/,
      /Пожалуйста, уберите сумку/,
    ])
      await page.getByRole("button", { name: answer }).click();
    await expect(
      page.getByRole("heading", { name: "В упражнении получилось" }),
    ).toBeVisible();
  });

test("неверное обещание → объяснение → повтор упражнения", async ({ page }) => {
  await page.goto("/");
  await start(page, "Сервис и свободный проход", false);
  await page.getByRole("button", { name: "Завершить", exact: true }).click();
  await page
    .locator(".practice-cards article")
    .filter({ hasText: "Помочь без лишних обещаний" })
    .getByRole("button")
    .click();
  await page
    .getByRole("button", { name: /через пять минут всё заработает/ })
    .click();
  await page
    .getByRole("button", { name: /Объяснить, что мест нет, сообщить/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Попробуйте ещё раз" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Извинение уместно, но срок не подтверждён/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Повторить упражнение" }).click();
  await page
    .getByRole("button", { name: /Срок ремонта пока неизвестен/ })
    .click();
  await page
    .getByRole("button", { name: /Объяснить, что мест нет, сообщить/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "В упражнении получилось" }),
  ).toBeVisible();
});

test("TC001 TC002 TC012 профиль и прочтение уведомлений", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Мой профиль" }).click();
  await page.getByRole("textbox").fill("Проводник-Тест-01");
  await page.getByLabel("Портрет").selectOption("chief_card");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Мой профиль" })).toContainText(
    "Проводник-Тест-01",
  );
  await page.getByRole("button", { name: "Уведомления", exact: true }).click();
  const count = Number(await page.locator(".notice-count").innerText());
  await page.locator(".notice").filter({ hasText: "Испытание:" }).click();
  await expect(
    page.getByRole("heading", { name: "Мой прогресс" }),
  ).toBeVisible();
  await expect(page.locator(".notice-count")).toHaveText(String(count - 1));
  await page.reload();
  await page.getByRole("button", { name: "Уведомления", exact: true }).click();
  await expect(
    page.locator(".notice").filter({ hasText: "Испытание:" }),
  ).toContainText("Прочитано");
});

test("TC004 TC006 TC008 TC016 переключение, реальная просрочка и разбор", async ({
  page,
}) => {
  test.setTimeout(100000);
  await page.goto("/");
  await start(page, "Сервис и свободный проход", false);
  await page
    .getByRole("button", { name: /Прошу прощения за неудобство/ })
    .click();
  await page
    .getByRole("button", { name: /Багаж в проходе/ })
    .waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: /Проверить доступные места/ }).click();
  await page.getByRole("button", { name: /Багаж в проходе/ }).click();
  await page
    .getByRole("button", { name: /Спросить, кому принадлежит/ })
    .click();
  // Required by TC006: let the actual server deadline pass, without changing browser clocks.
  await page.waitForTimeout(46000);
  await page.reload();
  await expect(page.locator(".decision-feedback")).toContainText(
    "Безопасность снизилась на 25",
  );
  await page.getByRole("button", { name: /Багаж в проходе/ }).click();
  await page.getByRole("button", { name: /Немедленно уберите/ }).click();
  await expect(page.locator(".decision-feedback")).toContainText(
    "Лояльность: -15 · Безопасность: +20",
  );
  await page.getByRole("button", { name: "Розетка", exact: false }).click();
  await page
    .getByRole("button", { name: /Предложить свободное место/ })
    .click();
  await page
    .getByRole("button", {
      name: "Сообщить начальнику поезда и инженеру.",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: /Вернуться к пассажиру с подтверждённой/ })
    .click();
  await expect(page.getByText("Незачёт", { exact: true })).toBeVisible();
  const event = page.locator(".event").filter({
    has: page.getByRole("heading", { name: "Время истекло", exact: true }),
  });
  await expect(event).toContainText("45 секунд");
  await expect(event).toContainText("Следовало установить владельца");
  await expect(event.locator("a")).toHaveAttribute(
    "href",
    "/sources/situations.pdf#page=7",
  );
});

test("TC007 пауза 10 секунд и возвращение после закрытия вкладки", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await start(page, "Похожая вещь", false);
  await page.getByRole("button", { name: "Пауза", exact: true }).click();
  await expect(page.getByText("Смена приостановлена")).toBeVisible();
  const before = await page.locator(".timer b").innerText();
  await page.waitForTimeout(10000);
  await page.reload();
  await expect(page.getByText("Смена приостановлена")).toBeVisible();
  expect(await page.locator(".timer b").innerText()).toEqual(before);
  await page.getByRole("button", { name: "Завершить", exact: true }).click();
  await start(page);
  await expect(
    page.getByRole("button", { name: "Пауза", exact: true }),
  ).toHaveCount(0);
  await page.close();
  const returned = await context.newPage();
  await returned.waitForTimeout(36000);
  await returned.goto("/");
  await returned.getByRole("button", { name: "Прогресс", exact: true }).click();
  await returned
    .locator(".history")
    .filter({ hasText: "Похожая вещь" })
    .first()
    .click();
  await expect(
    returned.getByText("Критическая ошибка", { exact: true }),
  ).toBeVisible();
});
