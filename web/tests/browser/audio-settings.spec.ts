import { expect, test } from "@playwright/test";

async function openSoundSettings(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Explorer menu", exact: true }).click();
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  return page.getByRole("group", { name: "Sound", exact: true });
}

test("sound starts through the first interaction and switches stay off after refresh", async ({ page, context }) => {
  await context.addInitScript(() => localStorage.setItem("hackuniverse.intro.v1.seen", "1"));
  await page.goto("/?lang=en");
  let settings = await openSoundSettings(page);
  await expect(settings.getByRole("switch", { name: "Music", exact: true })).toBeChecked();
  await expect(settings.getByRole("switch", { name: "Sound effects", exact: true })).toBeChecked();
  await expect(settings.getByRole("status").filter({ hasText: /^(Playing|Ready|Off)$/ })).toHaveText(["Playing", "Ready"], { timeout: 15000 });
  await expect(settings.getByRole("button", { name: /resume/i })).toHaveCount(0);

  await settings.getByRole("switch", { name: "Music", exact: true }).click();
  await settings.getByRole("switch", { name: "Sound effects", exact: true }).click();
  await expect(settings.getByRole("status").filter({ hasText: /^Off$/ })).toHaveText(["Off", "Off"]);
  await page.reload();
  settings = await openSoundSettings(page);
  await expect(settings.getByRole("switch", { name: "Music", exact: true })).not.toBeChecked();
  await expect(settings.getByRole("switch", { name: "Sound effects", exact: true })).not.toBeChecked();
  await expect(settings.getByRole("status").filter({ hasText: /^Off$/ })).toHaveText(["Off", "Off"]);
});

test("an existing muted choice fetches no audio and keyboard can enable one channel", async ({ page, context }) => {
  await context.addInitScript(() => {
    localStorage.setItem("hackuniverse.intro.v1.seen", "1");
    localStorage.setItem("hackuniverse.audio.v1", JSON.stringify({ schemaVersion: 1, musicEnabled: false, effectsEnabled: false, musicVolume: 0.25, effectsVolume: 0.4 }));
  });
  const audioRequests: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/audio/")) audioRequests.push(request.url()); });
  await page.goto("/?lang=en");
  const settings = await openSoundSettings(page);
  await expect(settings.getByRole("status").filter({ hasText: /^Off$/ })).toHaveText(["Off", "Off"]);
  await expect(settings.getByRole("slider", { name: "Music volume", exact: true })).toHaveValue("25");
  await expect(settings.getByRole("slider", { name: "Effects volume", exact: true })).toHaveValue("40");
  expect(audioRequests).toEqual([]);
  const music = settings.getByRole("switch", { name: "Music", exact: true });
  await music.focus();
  await music.press("Space");
  await expect(music).toBeChecked();
  await expect(settings.getByRole("status").filter({ hasText: /^(Playing|Off)$/ })).toHaveText(["Playing", "Off"], { timeout: 15000 });
  await expect(settings.getByRole("switch", { name: "Sound effects", exact: true })).not.toBeChecked();
});
