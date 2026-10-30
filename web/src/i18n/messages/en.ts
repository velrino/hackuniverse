import { universeEn } from "@/modules/universe/messages";
import { identityEn } from "@/modules/identity/messages";
const en = {
  common: {
    home: "Home",
    example: "Another page",
    designSystem: "Design system",
    navigation: "Main navigation",
    changeLanguage: "Change language",
    close: "Close",
    pageTitle: "HackUniverse · Your universe starts here",
  },
  languageDialog: {
    title: "Choose your language",
    description: "Make yourself at home. Choose how you explore HackUniverse.",
    current: "Current language",
    choose: "Choose language",
    hint: "You can change your language at any time.",
  },
  universe: universeEn,
  identity: identityEn,
  applicationIntro: {
    label: "Welcome to HackUniverse",
    detail: "Welcome animation · 3 seconds.",
  },
  notFound: {
    eyebrow: "Error 404 / Route not found",
    title: "Page not found.",
    description: "This page does not exist or has moved. Return home to continue exploring.",
    home: "Return home",
  },
  example: {
    eyebrow: "A new perspective",
    title: "Your universe starts here.",
    description: "One place for your discoveries. In your language.",
    noteLabel: "Try writing something",
    notePlaceholder: "A thought, an idea, a new world…",
    noteHint: "Your text stays here when you change languages.",
    planets: { one: "{count} planet", other: "{count} planets" },
  },
};

export default en;
