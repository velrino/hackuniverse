export const sectionOrder = [
  "principles", "colors", "typography", "buttons", "inputs", "dialogs", "loading", "brand",
] as const;

export type ShowcaseSectionId = (typeof sectionOrder)[number];
export type ShowcaseMode = "page" | "tabs";

export const colorTokens = [
  { key: "accent", variable: "--hud-accent" },
  { key: "surface", variable: "--hud-surface" },
  { key: "background", variable: "--background" },
  { key: "text", variable: "--hud-text" },
  { key: "muted", variable: "--hud-muted" },
  { key: "line", variable: "--hud-line" },
  { key: "secondary", variable: "--secondary" },
  { key: "destructive", variable: "--destructive" },
] as const;

export const buttonVariants = ["default", "secondary", "outline", "ghost", "destructive"] as const;
export const buttonSizes = ["xs", "sm", "default", "lg"] as const;
