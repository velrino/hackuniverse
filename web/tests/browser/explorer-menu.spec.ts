import { expect, test } from "@playwright/test";

const docs = "https://velrino.github.io/velrino-ui/";

for (const locale of ["en", "pt-BR"] as const) {
  test(`explorer modal and documentation navigation remain usable (${locale})`, async ({ page, context }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await context.addInitScript(() => localStorage.setItem("hackuniverse.intro.v1.seen", "1"));
    await context.route(`${docs}**`, (route) => route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Documentation</title><h1>Velrino UI</h1>",
    }));
    await page.goto(`/?lang=${locale}`);
    const canvas = await page.locator("canvas").elementHandle();
    expect(canvas).not.toBeNull();
    const menuName = locale === "en" ? "Explorer menu" : "Menu do explorador";
    const trigger = page.getByRole("button", { name: menuName, exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    // This checks the built stylesheet too: an unstyled portal falls below the scene.
    await expect(dialog).toBeInViewport();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    const settings = dialog.getByRole("tab", { name: locale === "en" ? "Settings" : "Opções", exact: true });
    await settings.click();
    await expect(settings).toHaveAttribute("aria-selected", "true");
    const link = dialog.locator(`a[href^="${docs}"]`);
    const target = new URL((await link.getAttribute("href"))!);
    expect(target.searchParams.get("lang")).toBe(locale);
    expect(target.searchParams.get("theme")).toBe("cyan");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    const original = page.url();
    const [popup] = await Promise.all([context.waitForEvent("page"), link.click()]);
    await expect(popup.locator("h1")).toHaveText("Velrino UI");
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    expect(page.url()).toBe(original);
    await popup.close();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await canvas!.evaluate((element) => element.isConnected)).toBe(true);
    await canvas!.dispose();
    expect(errors).toEqual([]);
  });
}
