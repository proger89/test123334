import { test, expect } from "@playwright/test";

test("псевдоним выводится как текст и не исполняет HTML", async ({ page }) => {
  test.skip(!!process.env.PUBLIC_SMOKE, "Local profile validation only");
  let dialogs = 0;
  page.on("dialog", async (dialog) => {
    dialogs++;
    await dialog.dismiss();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Мой профиль" }).click();
  const name = page.getByLabel("Псевдоним");
  await expect(name).toHaveAttribute("maxlength", "40");
  const text = "<img src=x onerror=alert(1)>";
  await name.fill(text);
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("button", { name: "Мой профиль" })).toContainText(text);
  await page.reload();
  await expect(page.getByRole("button", { name: "Мой профиль" })).toContainText(text);
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(dialogs).toBe(0);
});
