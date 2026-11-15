import { expect, test } from "@playwright/test";

test.skip(
  process.env.E2E_DATA_MODE !== "isolated",
  "Operations E2E writes records and must only run against isolated local data stores."
);

test("public citizen report becomes a verified, assigned incident in Supabase", async ({ page, request }) => {
  const unique = Date.now().toString(36);
  const description = `E2E Supabase ${unique}: asap tebal terlihat dari permukiman.`;
  const teamName = `Tim E2E ${unique}`;
  const pageErrors: string[] = [];
  const localServerErrors: string[] = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    const url = response.url();
    if (
      url.startsWith("http://127.0.0.1:3000/") &&
      response.status() >= 500 &&
      !url.includes("/api/hotspots")
    ) {
      localServerErrors.push(`${response.status()} ${url}`);
    }
  });

  const submitted = await request.post("/api/reports", {
    data: {
      lat: -2.2096,
      lon: 113.9213,
      description,
      submitterToken: `e2e-${unique}-citizen-token`,
    },
  });
  expect(submitted.status()).toBe(201);

  await page.goto("/incidents");
  await expect(page).toHaveURL(/\/incidents$/);
  await expect(page.getByRole("heading", { name: "Operasi Insiden" })).toBeVisible();

  await page.goto("/citizen-reports");
  await expect(page.getByRole("heading", { name: "Laporan Warga", exact: true })).toBeVisible();
  await expect(page.getByText(/Akses publik aktif/)).toBeVisible();
  const reportRow = page.locator("tbody tr").filter({ hasText: description });
  await expect(reportRow).toBeVisible();
  await reportRow.click();
  await expect(page.getByText(description, { exact: true }).first()).toBeVisible();
  const reviewPanel = page.getByRole("button", { name: "Simpan status" }).locator("..");
  await reviewPanel.locator("select").selectOption("verified");
  await reviewPanel.locator("textarea").fill("Bukti dan lokasi laporan warga telah diperiksa petugas lokal.");
  await page.getByRole("button", { name: "Simpan status" }).click();
  await expect(page.getByText(/Status diperbarui menjadi "Terverifikasi"/)).toBeVisible();

  await page.goto("/incidents");
  const candidate = page.locator("div").filter({ hasText: description }).filter({ has: page.getByRole("button", { name: "Buka insiden" }) }).last();
  await expect(candidate).toBeVisible();
  const incidentCreation = page.waitForResponse(
    (response) => response.url().endsWith("/api/operations/incidents") && response.request().method() === "POST"
  );
  await candidate.getByRole("button", { name: "Buka insiden" }).click();
  expect((await incidentCreation).status()).toBe(201);
  const detailPanel = page.getByTestId("incident-detail");
  await expect(detailPanel.getByText(description, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Tambah tim" }).click();
  await page.getByPlaceholder("Nama tim").fill(teamName);
  await page.getByPlaceholder("Wilayah mandat").fill("Kalimantan Tengah");
  await page.getByPlaceholder("Nama ketua").fill("Komandan E2E");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByText(teamName, { exact: true })).toBeVisible();

  const verificationForm = page.locator("form").filter({ hasText: "1. Verifikasi manusia" });
  await verificationForm.locator("select").selectOption("confirmed");
  await verificationForm.locator("textarea").fill("Bukti warga telah dikonfirmasi melalui pemeriksaan manusia.");
  const verificationMutation = page.waitForResponse(
    (response) => response.url().includes("/api/operations/incidents/") && response.request().method() === "PATCH"
  );
  await verificationForm.getByRole("button", { name: "Simpan verifikasi" }).click();
  expect((await verificationMutation).ok()).toBeTruthy();
  await expect(page.getByText("Bukti warga telah dikonfirmasi melalui pemeriksaan manusia.")).toBeVisible();

  const priorityForm = page.locator("form").filter({ hasText: "2. Prioritas manual" });
  await priorityForm.locator("select").selectOption("high");
  await priorityForm.locator("textarea").fill("Asap dekat permukiman memerlukan respons lapangan berprioritas tinggi.");
  const priorityMutation = page.waitForResponse(
    (response) => response.url().includes("/api/operations/incidents/") && response.request().method() === "PATCH"
  );
  await priorityForm.getByRole("button", { name: "Simpan prioritas" }).click();
  expect((await priorityMutation).ok()).toBeTruthy();
  await expect(page.getByText("Asap dekat permukiman memerlukan respons lapangan berprioritas tinggi.")).toBeVisible();

  const assignmentForm = page.locator("form").filter({ hasText: "3. Penugasan tim" });
  await assignmentForm.locator("select").selectOption({ label: `${teamName} · Kalimantan Tengah` });
  await assignmentForm.locator("textarea").fill("Tim lokal ditugaskan untuk pemeriksaan dan koordinasi lapangan.");
  const assignmentMutation = page.waitForResponse(
    (response) => response.url().includes("/api/operations/incidents/") && response.request().method() === "PATCH"
  );
  await assignmentForm.getByRole("button", { name: "Tugaskan tim" }).click();
  expect((await assignmentMutation).ok()).toBeTruthy();
  await expect(page.getByText("Tim lokal ditugaskan untuk pemeriksaan dan koordinasi lapangan.")).toBeVisible();

  const progressForm = page.locator("form").filter({ hasText: "4. Progres penanganan" });
  await progressForm.locator("select").selectOption("in_progress");
  await progressForm.locator("textarea").fill("Tim sudah bergerak dan penanganan lapangan sedang berlangsung.");
  const progressMutation = page.waitForResponse(
    (response) => response.url().includes("/api/operations/incidents/") && response.request().method() === "PATCH"
  );
  await progressForm.getByRole("button", { name: "Perbarui progres" }).click();
  expect((await progressMutation).ok()).toBeTruthy();
  await expect(page.getByText("Tim sudah bergerak dan penanganan lapangan sedang berlangsung.")).toBeVisible();
  await expect(page.getByText(new RegExp(`ditugaskan ke ${teamName}`)).first()).toBeVisible();
  await expect(page.getByText("Perubahan progres · Public Operator")).toBeVisible();

  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1);
  expect(pageErrors).toEqual([]);
  expect(localServerErrors).toEqual([]);

  await page.goto("/officer-login");
  await expect(page).toHaveURL(/\/incidents$/);
});
