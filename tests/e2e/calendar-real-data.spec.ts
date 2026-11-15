import { expect, test } from "@playwright/test";

test("calendar renders the production NASA FIRMS archive without synthetic fallback", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const historicalResponse = page.waitForResponse(
    (response) => response.url().includes("/api/historical") && response.request().method() === "GET"
  );
  await page.goto("/calendar");
  expect((await historicalResponse).ok()).toBeTruthy();

  await expect(
    page.getByRole("heading", { name: /Aktivitas Kebakaran Historis|Historical Burning Activity/ })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Ringkasan Aktivitas Tahunan|Yearly Activity Overview/ })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Kalender Aktivitas Kebakaran|Burning Activity Calendar/ })
  ).toBeVisible();
  await expect(page.getByTestId("historical-real-data-empty")).toHaveCount(0);
  await expect(page.getByText(/Mode demo|Contoh data|Sample data|fabricated/i)).toHaveCount(0);
  expect(pageErrors).toEqual([]);

  if (process.env.E2E_SCREENSHOT_PATH) {
    await page.screenshot({ path: process.env.E2E_SCREENSHOT_PATH, fullPage: true });
  }
});
