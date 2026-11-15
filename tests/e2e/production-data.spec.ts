import { expect, test } from "@playwright/test";

test("production data is rendered and public write paths stay closed", async ({ page, request }) => {
  const historicalResponse = await request.get("/api/historical");
  expect(historicalResponse.ok()).toBeTruthy();
  const historical = await historicalResponse.json();
  expect(historical.months.length).toBeGreaterThan(300);
  expect(historical.cells.length).toBeGreaterThan(0);
  expect(historical.months[0]).toMatchObject({ year: 2000, dataStatus: "archive" });
  expect(historical.months.at(-1)).toMatchObject({ year: 2026, dataStatus: "nrt" });

  const liveResponse = await request.get("/api/hotspots?days=1");
  expect(liveResponse.ok()).toBeTruthy();
  const live = await liveResponse.json();
  expect(live.meta).toMatchObject({ provider: "NASA FIRMS", area: "Indonesia", degraded: false });
  expect(live.markers.length).toBeGreaterThan(0);
  expect(live.meta.sources.some((source: { rawCount: number }) => source.rawCount > 0)).toBeTruthy();

  const regionResponse = await request.get("/api/region?lat=-2.2096&lon=113.9213");
  expect(regionResponse.ok()).toBeTruthy();
  await expect(regionResponse.json()).resolves.toMatchObject({
    available: true,
    admin: {
      kecamatan: "Pahandut",
      kabupatenKota: "Kota Palangka Raya",
      provinsi: "Kalimantan Tengah",
      approximate: false,
    },
    source: { license: "CC BY-IGO" },
  });

  const blockedSubmission = await request.post("/api/reports", {
    data: { lat: -2, lon: 104.8, description: "Smoke", submitterToken: "guard-check" },
  });
  expect(blockedSubmission.status()).toBe(503);
  expect((await blockedSubmission.json()).code).toBe("REPORTING_DISABLED");

  const blockedReview = await request.patch("/api/reports/not-a-real-report", {
    data: { status: "verified" },
  });
  expect(blockedReview.status()).toBe(403);
  expect((await blockedReview.json()).code).toBe("REPORT_REVIEW_DISABLED");

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "Aktivitas Kebakaran Historis" })).toBeVisible();
  await expect(page.getByTestId("historical-real-data-empty")).toHaveCount(0);

  await page.goto("/community/report");
  await expect(page.getByRole("heading", { name: "Pelaporan warga belum dibuka" })).toBeVisible();
  await expect(page.getByRole("button", { name: /kirim laporan/i })).toHaveCount(0);

  await page.goto("/citizen-reports");
  await expect(page.getByRole("heading", { name: "Laporan Warga", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Simpan status" })).toHaveCount(0);

  await page.goto("/community/notifikasi");
  await expect(page.getByRole("heading", { name: "Pemberitahuan dalam aplikasi" })).toBeVisible();
  await expect(page.getByText(/Sistem belum mengirim push notification/)).toBeVisible();

  expect(pageErrors).toEqual([]);
});
