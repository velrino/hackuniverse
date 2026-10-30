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
    await page.goto(`/?lang=${locale}&check=inline-language#explorer-menu`);
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
    const tabs = locale === "en" ? ["Go to", "Settings", "About"] : ["Ir para", "Configurações", "Sobre"];
    await expect(dialog.getByRole("tab")).toHaveText(tabs);
    await expect(dialog.getByRole("tab", { name: tabs[0], exact: true })).toHaveAttribute("aria-selected", "true");
    const searchName = locale === "en" ? "Search planets" : "Buscar planetas";
    await dialog.getByRole("textbox", { name: searchName, exact: true }).fill("earth");
    const settings = dialog.getByRole("tab", { name: tabs[1], exact: true });
    await settings.click();
    await expect(settings).toHaveAttribute("aria-selected", "true");
    const english = dialog.getByRole("button", { name: "English", exact: true });
    const portuguese = dialog.getByRole("button", { name: "Português (Brasil)", exact: true });
    await expect(english).toBeVisible();
    await expect(portuguese).toBeVisible();
    await expect(locale === "en" ? english : portuguese).toHaveAttribute("aria-pressed", "true");
    await (locale === "en" ? portuguese : english).click();
    const alternate = locale === "en" ? "pt-BR" : "en";
    await expect(page).toHaveURL((url) => url.searchParams.get("lang") === alternate && url.searchParams.get("check") === "inline-language" && url.hash === "#explorer-menu");
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(dialog.getByRole("tab", { name: locale === "en" ? "Configurações" : "Settings", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(locale === "en" ? portuguese : english).toHaveAttribute("aria-pressed", "true");
    expect(await canvas!.evaluate((element) => element.isConnected)).toBe(true);
    await (locale === "en" ? english : portuguese).click();
    await expect(page).toHaveURL((url) => url.searchParams.get("lang") === locale && url.searchParams.get("check") === "inline-language" && url.hash === "#explorer-menu");
    await expect(locale === "en" ? english : portuguese).toHaveAttribute("aria-pressed", "true");
    await expect(settings).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("dialog")).toHaveCount(1);
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
    await trigger.click();
    await expect(dialog.getByRole("tab", { name: tabs[0], exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(dialog.getByRole("textbox", { name: searchName, exact: true })).toHaveValue("earth");
    await dialog.getByRole("tab", { name: tabs[2], exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Denis Velrino", exact: true })).toBeVisible();
    for (const href of ["https://github.com/velrino/hackuniverse", "https://github.com/velrino/", "https://www.linkedin.com/in/velrino/", "https://sketchfab.com/yanix", "https://creativecommons.org/licenses/by/4.0/"]) {
      const aboutLink = dialog.locator(`a[href="${href}"]`);
      await expect(aboutLink).toHaveAttribute("target", "_blank");
      await expect(aboutLink).toHaveAttribute("rel", "noopener noreferrer");
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await canvas!.evaluate((element) => element.isConnected)).toBe(true);
    await canvas!.dispose();
    expect(errors).toEqual([]);
  });
}
