import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
const code =
  process.env.EDITOR_ACCESS_CODE ||
  readFileSync(path.resolve(import.meta.dirname, "../../.env"), "utf8")
    .split(/\r?\n/)
    .find((x) => x.startsWith("EDITOR_ACCESS_CODE="))
    ?.split("=")[1];
async function editor(page: Page) {
  await page.goto("/#editor");
  await expect(
    page.getByRole("heading", { name: "Редактор сценариев" }),
  ).toBeVisible();
  await page.getByLabel("Код доступа").fill(code!);
  await page
    .getByRole("button", { name: "Открыть редактор", exact: true })
    .click();
  await expect(page.getByLabel("Взять за основу")).toBeVisible();
  await page.getByLabel("Взять за основу").selectOption("security:1");
  await page
    .getByRole("button", { name: "Создать черновик", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Текст ситуации", exact: true }),
  ).toBeVisible();
}
test("редактор: новая ветка → сохранение → проба → публикация → обучение", async ({
  page,
}) => {
  test.skip(
    !!process.env.PUBLIC_SMOKE,
    "Publication is exercised only in the isolated acceptance database",
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1366, height: 1000 });
  await editor(page);
  await page
    .getByRole("textbox", { name: "Текст ситуации", exact: true })
    .fill("В проходе обнаружена сумка. Владелец не откликнулся.");
  await page.getByRole("button", { name: "Добавить шаг", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Текст ситуации", exact: true })
    .fill("Сообщение принято. Действуйте по указаниям ответственных.");
  await page
    .getByRole("textbox", { name: "Текст кнопки", exact: true })
    .fill("Завершить учебную ситуацию.");
  await page
    .getByRole("textbox", { name: "Объяснение для сотрудника", exact: true })
    .fill("Пассажиры предупреждены, сообщение передано ответственным.");
  await page
    .getByRole("textbox", { name: "Источник: документ и пункт", exact: true })
    .fill("Ситуации на борту, №41");
  await page.getByRole("button", { name: /Шаг 1 · s0/ }).click();
  const complete = page.getByRole("region", {
    name: "Действие 5",
    exact: true,
  });
  const targets = complete.getByLabel("Что произойдёт после выбора");
  const newTarget = await targets
    .locator("option")
    .last()
    .getAttribute("value");
  await targets.selectOption(newTarget!);
  await page
    .getByRole("button", { name: "Сохранить черновик", exact: true })
    .click();
  await expect(
    page.getByText("Переходы и условия проверены.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await page.getByLabel("Мои черновики").selectOption({ index: 1 });
  await expect(
    page.getByRole("textbox", { name: "Текст ситуации", exact: true }),
  ).toHaveValue("В проходе обнаружена сумка. Владелец не откликнулся.");
  await page.getByRole("button", { name: "Попробовать", exact: true }).click();
  await page.getByRole("button", { name: /По связи сообщить/ }).click();
  await page
    .getByRole("button", { name: /Не трогать вещь и предупредить/ })
    .click();
  await page
    .getByRole("button", { name: "Завершить обращение.", exact: true })
    .click();
  await expect(
    page.getByText(
      "Сообщение принято. Действуйте по указаниям ответственных.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Завершить учебную ситуацию.", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Зачёт · 100 из 100", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Вернуться к черновику" }).click();
  for (const width of [390, 768, 1366]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: path.resolve(import.meta.dirname, `../../tmp/editor-${width}.png`),
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
  await page
    .getByRole("button", { name: "Опубликовать для обучения", exact: true })
    .click();
  await expect(page.getByText(/Версия \d+ доступна в обучении/)).toBeVisible();
  await page.getByRole("button", { name: "Сценарии", exact: true }).click();
  await page
    .locator(".scenario-list article")
    .filter({ hasText: "Похожая вещь" })
    .getByRole("button")
    .click();
  await page.getByRole("button", { name: "Начать смену", exact: true }).click();
  await expect(
    page.getByText("В проходе обнаружена сумка. Владелец не откликнулся.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("черновик: защита от потери текста и ошибки переходов", async ({
  page,
}) => {
  await editor(page);
  await page
    .getByRole("textbox", { name: "Текст ситуации", exact: true })
    .fill("Текст, который нельзя потерять");
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Сценарии", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Текст ситуации", exact: true }),
  ).toHaveValue("Текст, который нельзя потерять");
  await page.getByRole("button", { name: "Добавить шаг", exact: true }).click();
  await page
    .getByRole("button", { name: "Сохранить черновик", exact: true })
    .click();
  await expect(
    page.getByText("Перед публикацией нужно исправить:"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Опубликовать", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Попробовать", exact: true }),
  ).toBeDisabled();
});
test("публичный редактор: вход, сохранение, проба без публикации", async ({
  page,
}) => {
  test.skip(!process.env.PUBLIC_SMOKE);
  await editor(page);
  await page
    .getByRole("textbox", { name: "Текст ситуации", exact: true })
    .fill("Багаж без владельца: на обращение никто не откликнулся.");
  await page
    .getByRole("button", { name: "Сохранить черновик", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Попробовать", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Попробовать", exact: true }).click();
  await page.getByRole("button", { name: /По связи сообщить/ }).click();
  await page
    .getByRole("button", { name: /Не трогать вещь и предупредить/ })
    .click();
  await page
    .getByRole("button", { name: "Завершить обращение.", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Зачёт · 100 из 100", exact: true }),
  ).toBeVisible();
});
test("редактор: CSRF, параллельное сохранение и повтор публикации", async ({
  page,
}) => {
  test.skip(!!process.env.PUBLIC_SMOKE);
  await editor(page);
  const id = await page.getByLabel("Мои черновики").inputValue();
  const session = await (await page.request.get("/api/v1/session")).json();
  const headers = { "X-CSRF-TOKEN": session.csrf };
  const draft = await (
    await page.request.get("/api/v1/editor/drafts/" + id)
  ).json();
  const url = "/api/v1/editor/drafts/" + id;
  const invalid = await page.request.put(url, {
    data: {
      expected_revision: 0,
      definition: JSON.stringify(draft.definition),
    },
  });
  expect(invalid.status()).toBe(419);
  const saves = await Promise.all(
    [1, 2].map((n) =>
      page.request.put(url, {
        headers,
        data: {
          expected_revision: 0,
          definition: JSON.stringify({
            ...draft.definition,
            intro: draft.definition.intro + " Учебная редакция " + n + ".",
          }),
        },
      }),
    ),
  );
  expect(saves.map((r) => r.status()).sort()).toEqual([200, 409]);
  const current = await (await page.request.get(url)).json();
  const published = await Promise.all(
    [1, 2].map(() =>
      page.request.post(url + "/publish", {
        headers,
        data: { expected_revision: current.revision },
      }),
    ),
  );
  expect(published.map((r) => r.status())).toEqual([200, 200]);
  expect((await published[0].json()).published_version).toBe(
    (await published[1].json()).published_version,
  );
});
