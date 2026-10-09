import { test, expect } from "@playwright/test";

test("backend missing is explicit and never replaced with made-up stock", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Publicaciones de calidad" })).toBeVisible();
  await expect(page.locator(".vehicleCard")).toHaveCount(0);
  await expect(page.locator("#catalogo")).toContainText("catálogo");
  await expect(page.locator("#catalogo")).toContainText("conexión");
  await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("auth dismisses with Escape and restores focus, repeatedly", async ({ page }) => {
  await page.goto("/");
  const opener = page.locator("header.topbar").getByRole("button", { name: "Vender mi vehiculo", exact: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await opener.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();
  }
});

test("browser Back dismisses auth and Forward restores it", async ({ page }) => {
  await page.goto("/");
  await page.locator("header.topbar").getByRole("button", { name: "Vender mi vehiculo", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Publicaciones de calidad" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("keyboard focus stays in auth until dismissed", async ({ page }) => {
  await page.goto("/");
  await page.locator("header.topbar").getByRole("button", { name: "Vender mi vehiculo", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cerrar", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Crear cuenta y publicar", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Cerrar", exact: true })).toBeFocused();
});

test("hero publish action opens registration and closes without losing the page", async ({ page }) => {
  await page.goto("/");
  const opener = page.locator(".salesHero").getByRole("button", { name: "Vender mi vehiculo", exact: true });
  await opener.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("AI stays unavailable until explicitly configured and exposes no credentials", async ({ request }) => {
  const response = await request.post('/api/assistant', { data: { messageId: '00000000-0000-4000-8000-000000000001' } });
  expect(response.status()).toBe(503);
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(await response.json()).toEqual({ state: 'unavailable' });
});
