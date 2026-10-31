import { expect, test, type Locator } from "@playwright/test";
import { languageOptions, type Locale } from "../../src/i18n/config";
import { messages } from "../../src/i18n/messages";

test.use({ locale: "fil-PH" });

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem("hackuniverse.intro.v1.seen", "1");
    localStorage.setItem("hackuniverse.demo-tour.v1.seen", "1");
    localStorage.setItem("hackuniverse.audio.v1", JSON.stringify({ schemaVersion: 1, musicEnabled: false, effectsEnabled: false, musicVolume: 0.35, effectsVolume: 0.5 }));
  });
});

function option(locale: Locale) {
  const value = languageOptions.find((entry) => entry.locale === locale);
  if (!value) throw new Error(`Missing visible language option: ${locale}`);
  return value;
}

async function expectLanguageRows(buttons: Locator) {
  await expect(buttons).toHaveCount(3);
  await expect(buttons.last()).toBeVisible();
  const rows = await buttons.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    const parent = element.parentElement!.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom, containerWidth: parent.width };
  }));
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    expect(Math.abs(row.x - rows[0].x)).toBeLessThan(1);
    expect(Math.abs(row.width - row.containerWidth)).toBeLessThan(1);
    expect(row.height).toBeGreaterThanOrEqual(44);
    if (index > 0) expect(row.y).toBeGreaterThanOrEqual(rows[index - 1].bottom);
  }
}

test("browser preferences and explicit query select the same server-rendered locale", async ({ request }) => {
  const cases: { header: string; query?: string; locale: Locale }[] = [
    { header: "fil-PH,fil;q=0.9,en-US;q=0.8", locale: "fil" },
    { header: "tl-PH,tl;q=0.9,en;q=0.8", locale: "fil" },
    { header: "pt-PT,pt;q=0.9,en;q=0.8", locale: "pt-BR" },
    { header: "pt-BR;q=0.4,fil-PH;q=0.9,en;q=0.5", locale: "fil" },
    { header: "fil;q=0,en-GB;q=0.8", locale: "en" },
    { header: "fr-FR,ja;q=0.9", locale: "en" },
    { header: "fil-PH", query: "lang=en", locale: "en" },
    { header: "fil-PH", query: "lang=pt-BR", locale: "pt-BR" },
    { header: "en-US", query: "lang=fil", locale: "fil" },
    { header: "fil-PH", query: "lang=invalid", locale: "en" },
    { header: "fil-PH", query: "lang=fil&lang=pt-BR", locale: "en" },
  ];
  for (const entry of cases) {
    const response = await request.get(`/example${entry.query ? `?${entry.query}` : ""}`, { headers: { "Accept-Language": entry.header } });
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toMatch(new RegExp(String.raw`<html\b[^>]*\blang="${entry.locale}"`));
    expect(html).toContain(`<title>${messages[entry.locale].common.pageTitle}</title>`);
    expect(html).toContain(messages[entry.locale].example.title);
  }
});

test("header language choices occupy separate rows and preserve input and global navigation", async ({ page }) => {
  const errors: string[] = [];
  const documents: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (request.resourceType() === "document") documents.push(request.url()); });
  await page.goto("/example?lang=en&check=browser-language#note");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle(messages.en.common.pageTitle);
  // The modal makes the page inert, but the same input must keep its value.
  const note = page.locator("#example-note");
  await note.fill("Synthetic note retained across all three languages");
  const input = await note.elementHandle();
  // A server-selected override must not replace the browser fallback. Removing
  // it returns to Filipino in place, including on this non-universe page.
  await page.evaluate(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("lang");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  });
  await expect(page.locator("html")).toHaveAttribute("lang", "fil");
  await expect(page).toHaveTitle(messages.fil.common.pageTitle);
  await expect(page.getByRole("heading", { name: messages.fil.example.title, exact: true })).toBeVisible();
  await expect(note).toHaveValue("Synthetic note retained across all three languages");
  expect(await input!.evaluate((element) => element.isConnected)).toBe(true);
  await expect(page).toHaveURL((url) => !url.searchParams.has("lang") && url.searchParams.get("check") === "browser-language" && url.hash === "#note");
  const trigger = page.locator(".application-shell__header").getByRole("button").last();
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const choices = dialog.locator("button[aria-pressed]");
  await expectLanguageRows(choices);
  expect(await choices.locator("span[lang]").evaluateAll((elements) => elements.map((element) => element.getAttribute("lang")))).toEqual(["en", "pt-BR", "fil"]);

  for (const locale of ["en", "pt-BR", "fil"] as const) {
    await dialog.getByRole("button", { name: option(locale).label, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page).toHaveTitle(messages[locale].common.pageTitle);
    await expect(dialog).toHaveAccessibleName(messages[locale].languageDialog.title);
    await expect(dialog.getByRole("button", { name: option(locale).label, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL((url) => url.pathname === "/example" && url.searchParams.get("lang") === locale && url.searchParams.get("check") === "browser-language" && url.hash === "#note");
    await expect(note).toHaveValue("Synthetic note retained across all three languages");
    expect(await input!.evaluate((element) => element.isConnected)).toBe(true);
  }
  expect(documents).toHaveLength(1);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  const home = page.getByRole("navigation").getByRole("link", { name: messages.fil.common.home, exact: true });
  await expect(home).toHaveAttribute("href", "/?lang=fil");
  await home.click();
  await expect(page).toHaveURL((url) => url.pathname === "/" && url.searchParams.get("lang") === "fil");
  await expect(page.locator("html")).toHaveAttribute("lang", "fil");
  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === "/example" && url.searchParams.get("lang") === "fil" && url.searchParams.get("check") === "browser-language" && url.hash === "#note");
  await expect(page.locator("html")).toHaveAttribute("lang", "fil");
  await page.goForward();
  await expect(page).toHaveURL((url) => url.pathname === "/" && url.searchParams.get("lang") === "fil");
  expect(errors).toEqual([]);
  await input!.dispose();
});

test("universe language choices occupy separate rows and preserve the mounted scene", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?check=universe-language#scene");
  await expect(page.locator("html")).toHaveAttribute("lang", "fil");
  await expect(page.locator("canvas")).toBeVisible();
  const canvas = await page.locator("canvas").elementHandle();
  await page.getByRole("button", { name: messages.fil.universe.menu, exact: true }).click();
  const menu = page.locator('.universe-explorer-menu[role="dialog"]');
  await menu.getByRole("tab", { name: messages.fil.universe.tabs.settings, exact: true }).click();
  await menu.getByRole("button", { name: messages.fil.universe.menuGroups.language, exact: true }).click();
  const dialog = page.locator('.universe-menu-category-dialog[role="dialog"]');
  await expectLanguageRows(dialog.locator("button[aria-pressed]"));
  for (const locale of ["en", "pt-BR", "fil"] as const) {
    await dialog.getByRole("button", { name: option(locale).fullLabel, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(dialog).toHaveAccessibleName(messages[locale].universe.menuGroups.language);
    await expect(menu.locator('[role="tab"][aria-selected="true"]')).toHaveText(messages[locale].universe.tabs.settings);
    await expect(page).toHaveURL((url) => url.pathname === "/" && url.searchParams.get("lang") === locale && url.searchParams.get("check") === "universe-language" && url.hash === "#scene");
    expect(await canvas!.evaluate((element) => element.isConnected)).toBe(true);
    await expect(page.locator("canvas")).toHaveCount(1);
  }
  await page.keyboard.press("Escape");
  await expect(menu.getByRole("button", { name: messages.fil.universe.menuGroups.language, exact: true })).toBeFocused();
  expect(errors).toEqual([]);
  await canvas!.dispose();
});

test("design redirects propagate browser detection and explicit query overrides", async ({ request }) => {
  for (const [path, locale] of [["/design", "fil"], ["/design?lang=en", "en"], ["/design?lang=pt-BR", "pt-BR"], ["/design?lang=fil", "fil"]] as const) {
    const response = await request.get(path, { headers: { "Accept-Language": "fil-PH,en;q=0.8" }, maxRedirects: 0 });
    expect(response.status()).toBe(307);
    const target = new URL(response.headers().location);
    expect(target.origin).toBe("https://velrino.github.io");
    expect(target.searchParams.get("lang")).toBe(locale);
    expect(target.searchParams.get("theme")).toBe("cyan");
  }
});
