import { expect, type Page } from "@playwright/test";

/** Sound is a nested dialog; close it before returning to the parent menu. */
export async function openSoundSettings(page: Page) {
  await page.getByRole("button", { name: "Explorer menu", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Mission controls", exact: true });
  await menu.getByRole("tab", { name: "Settings", exact: true }).click();
  await menu.getByRole("button", { name: "Sound", exact: true }).click();
  const sound = page.getByRole("dialog", { name: "Sound", exact: true });
  await expect(sound).toBeVisible();
  return sound.getByRole("group", { name: "Sound", exact: true });
}

export async function closeSoundSettings(page: Page) {
  const sound = page.getByRole("dialog", { name: "Sound", exact: true });
  await sound.getByRole("button", { name: "Close", exact: true }).click();
  await expect(sound).not.toBeVisible();
  const menu = page.getByRole("dialog", { name: "Mission controls", exact: true });
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: "Close", exact: true }).click();
  await expect(menu).not.toBeVisible();
}
