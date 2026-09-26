import { test, expect } from "@playwright/test";

test("HTTPS: доверенный сертификат, переход с HTTP и сохранение профиля", async ({
  page,
  context,
  request,
  baseURL,
}) => {
  test.skip(!baseURL?.startsWith("https://"), "Only for the HTTPS deployment");
  const secure = new URL(baseURL!);
  const plain = new URL(secure);
  plain.protocol = "http:";
  plain.port = "";
  plain.pathname = "/api/v1/scenarios";
  plain.search = "?https-check=1";
  const redirect = await request.get(plain.href, { maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe(
    `${secure.origin}/api/v1/scenarios?https-check=1`,
  );
  expect(redirect.headers()["set-cookie"]).toBeUndefined();

  // The browser uses its normal trust store: certificate errors are not ignored.
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const security = await response!.securityDetails();
  expect(security).not.toBeNull();
  expect(security!.validFrom! * 1000).toBeLessThan(Date.now());
  expect(security!.validTo! * 1000).toBeGreaterThan(Date.now());
  await expect(page.getByRole("heading", { name: "Выберите учебную смену" })).toBeVisible();
  const profile = page.getByRole("button", { name: "Мой профиль" });
  const originalProfile = await profile.innerText();
  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name.endsWith("-session"));
  expect(session?.secure).toBe(true);
  expect(session?.httpOnly).toBe(true);

  plain.pathname = "/";
  plain.search = "";
  plain.hash = "#editor";
  await page.goto(plain.href);
  await expect(page).toHaveURL(`${secure.origin}/#editor`);
  await expect(page.getByRole("heading", { name: "Редактор сценариев" })).toBeVisible();
  await expect(profile).toHaveText(originalProfile);
});
