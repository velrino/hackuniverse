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
    const dialog = page.locator('.universe-explorer-menu[role="dialog"]');
    // This checks the built stylesheet too: an unstyled portal falls below the scene.
    await expect(dialog).toBeInViewport();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    const tabs = locale === "en" ? ["Pause", "Go to", "Settings", "About"] : ["Pausa", "Ir para", "Configurações", "Sobre"];
    await expect(dialog.getByRole("tab")).toHaveText(tabs);
    await expect(dialog.getByRole("tab", { name: tabs[0], exact: true })).toHaveAttribute("aria-selected", "true");
    const pause = dialog.getByRole("tabpanel", { name: tabs[0], exact: true });
    const quickActions = locale === "en" ? ["Resume", "Nearby systems", "Tour", "Reset", "Close"] : ["Retomar", "Sistemas próximos", "Tour", "Restaurar", "Fechar"];
    await expect(pause.getByRole("button")).toHaveText(quickActions);
    await pause.getByRole("button", { name: quickActions[0], exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await pause.getByRole("button", { name: quickActions[4], exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await dialog.getByRole("tab", { name: tabs[0], exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(dialog.getByRole("tab", { name: tabs[1], exact: true })).toHaveAttribute("aria-selected", "true");
    const searchName = locale === "en" ? "Search planets" : "Buscar planetas";
    await dialog.getByRole("textbox", { name: searchName, exact: true }).fill("earth");
    const settings = dialog.getByRole("tab", { name: tabs[2], exact: true });
    await settings.click();
    await expect(settings).toHaveAttribute("aria-selected", "true");
    const categories = locale === "en"
      ? ["Language", "Sound", "Workspace and data", "Visual", "Spaceship", "Navigation guide", "Resources"]
      : ["Idioma", "Som", "Espaço de trabalho e dados", "Visual", "Nave espacial", "Guia de navegação", "Recursos"];
    const settingsPanel = dialog.getByRole("tabpanel", { name: tabs[2], exact: true });
    await expect(settingsPanel.getByRole("button")).toHaveText(categories);
    await settingsPanel.getByRole("button", { name: categories[0], exact: true }).click();
    const child = page.locator('.universe-menu-category-dialog[role="dialog"]');
    await expect(child).toHaveAccessibleName(categories[0]);
    await expect(dialog).toHaveAttribute("data-state", "open");
    const english = child.getByRole("button", { name: "English", exact: true });
    const portuguese = child.getByRole("button", { name: "Português (Brasil)", exact: true });
    await expect(english).toBeVisible();
    await expect(portuguese).toBeVisible();
    await expect(locale === "en" ? english : portuguese).toHaveAttribute("aria-pressed", "true");
    await (locale === "en" ? portuguese : english).click();
    const alternate = locale === "en" ? "pt-BR" : "en";
    await expect(page).toHaveURL((url) => url.searchParams.get("lang") === alternate && url.searchParams.get("check") === "inline-language" && url.hash === "#explorer-menu");
    await expect(child).toHaveAccessibleName(locale === "en" ? "Idioma" : "Language");
    await expect(dialog).toHaveAttribute("data-state", "open");
    await expect(locale === "en" ? portuguese : english).toHaveAttribute("aria-pressed", "true");
    expect(await canvas!.evaluate((element) => element.isConnected)).toBe(true);
    await (locale === "en" ? english : portuguese).click();
    await expect(page).toHaveURL((url) => url.searchParams.get("lang") === locale && url.searchParams.get("check") === "inline-language" && url.hash === "#explorer-menu");
    await expect(locale === "en" ? english : portuguese).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(child).toBeHidden();
    await expect(settings).toHaveAttribute("aria-selected", "true");
    await expect(settingsPanel.getByRole("button", { name: categories[0], exact: true })).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await settingsPanel.getByRole("button", { name: categories[3], exact: true }).click();
    await expect(child).toHaveAccessibleName(categories[3]);
    await expect(child.getByRole("button", { name: "Tour", exact: true })).toHaveCount(0);
    await expect(child.getByRole("button", { name: quickActions[2], exact: true })).toHaveCount(0);
    await child.getByRole("button", { name: locale === "en" ? "Close" : "Fechar", exact: true }).click();
    await expect(settingsPanel.getByRole("button", { name: categories[3], exact: true })).toBeFocused();
    await settingsPanel.getByRole("button", { name: categories[6], exact: true }).click();
    const link = child.locator(`a[href^="${docs}"]`);
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
    await expect(child).toBeHidden();
    await expect(dialog).toBeVisible();
    await expect(settingsPanel.getByRole("button", { name: categories[6], exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(dialog.getByRole("tab", { name: tabs[0], exact: true })).toHaveAttribute("aria-selected", "true");
    await dialog.getByRole("tab", { name: tabs[1], exact: true }).click();
    await expect(dialog.getByRole("textbox", { name: searchName, exact: true })).toHaveValue("earth");
    await dialog.getByRole("tab", { name: tabs[3], exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Denis Velrino", exact: true })).toBeVisible();
    for (const href of ["https://github.com/velrino/hackuniverse", "https://github.com/velrino/", "https://www.linkedin.com/in/velrino/", "https://sketchfab.com/yanix", "https://creativecommons.org/licenses/by/4.0/"]) {
      const aboutLink = dialog.locator(`a[href="${href}"]`);
      await expect(aboutLink).toHaveAttribute("target", "_blank");
      await expect(aboutLink).toHaveAttribute("rel", "noopener noreferrer");
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    const floatingActions = page.getByRole("button", { name: locale === "en" ? "Actions" : "Ações", exact: true });
    const shareName = locale === "en" ? "Share view" : "Compartilhar vista";
    await floatingActions.click();
    await page.getByRole("button", { name: shareName, exact: true }).click();
    const share = page.getByRole("dialog", { name: shareName, exact: true });
    await expect(share).toBeInViewport();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await share.getByRole("button", { name: locale === "en" ? "Copy view link" : "Copiar link da vista", exact: true }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get("lang") === locale &&
      url.searchParams.has("target") && url.searchParams.has("camera") &&
      url.searchParams.get("check") === "inline-language" && url.hash === "#explorer-menu");
    await page.keyboard.press("Escape");
    await expect(share).toBeHidden();
    await expect(floatingActions).toBeFocused();
    expect(await canvas!.evaluate((element) => element.isConnected)).toBe(true);
    await canvas!.dispose();
    expect(errors).toEqual([]);
  });
}

test("pause quick actions reset the current camera and start a repeatable tour", async ({ page, context }) => {
  await context.addInitScript(() => {
    localStorage.setItem("hackuniverse.intro.v1.seen", "1");
    localStorage.setItem("hackuniverse.demo-tour.v1.seen", "1");
    localStorage.setItem("hackuniverse.audio.v1", JSON.stringify({ schemaVersion: 1, musicEnabled: false, effectsEnabled: false, musicVolume: 0.35, effectsVolume: 0.5 }));
  });
  const initialCamera = "30,8,10,0,0,0";
  await page.goto(`/?lang=en&source=demo&target=planet-earth&camera=${initialCamera}`);
  await expect(page.locator("main")).toHaveAttribute("data-scale", "planet");
  const trigger = page.getByRole("button", { name: "Explorer menu", exact: true });
  const dialog = page.locator('.universe-explorer-menu[role="dialog"]');
  await trigger.click();
  await dialog.getByRole("tabpanel", { name: "Pause", exact: true }).getByRole("button", { name: "Reset", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  // Copy reads the current camera synchronously. Reset's visual behavior does
  // not depend on whether a background history report has already arrived.
  const floatingActions = page.getByRole("button", { name: "Actions", exact: true });
  await floatingActions.click();
  await page.getByRole("button", { name: "Share view", exact: true }).click();
  const share = page.getByRole("dialog", { name: "Share view", exact: true });
  await share.getByRole("button", { name: "Copy view link", exact: true }).click();
  await expect(page).toHaveURL((url) => {
    const camera = url.searchParams.get("camera");
    return url.searchParams.get("target") === "planet-earth" && url.searchParams.get("lang") === "en" &&
      camera !== null && camera !== initialCamera;
  });
  await page.keyboard.press("Escape");
  await expect(share).toBeHidden();
  await expect(floatingActions).toBeFocused();
  await trigger.click();
  await dialog.getByRole("tabpanel", { name: "Pause", exact: true }).getByRole("button", { name: "Tour", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("main")).toHaveAttribute("data-tour-active", "true");
  await expect(floatingActions).toBeHidden();
  const skip = page.getByRole("button", { name: "Skip tour", exact: true });
  await expect(skip).toBeFocused();
  await skip.click();
  await expect(page.locator("main")).toHaveAttribute("data-tour-active", "false");
});
