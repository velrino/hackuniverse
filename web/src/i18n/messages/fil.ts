import { universeFil } from "@/modules/universe/messages";
import { identityFil } from "@/modules/identity/messages";
import type { Messages } from "../messages";

const fil = {
  common: {
    home: "Panimula",
    example: "Ibang pahina",
    designSystem: "Sistema ng disenyo",
    navigation: "Pangunahing nabigasyon",
    changeLanguage: "Palitan ang wika",
    close: "Isara",
    pageTitle: "HackUniverse · Dito nagsisimula ang iyong uniberso",
  },
  languageDialog: {
    title: "Piliin ang iyong wika",
    description: "Maging komportable. Piliin kung paano mo gagalugarin ang HackUniverse.",
    current: "Kasalukuyang wika",
    choose: "Pumili ng wika",
    hint: "Maaari mong palitan ang iyong wika anumang oras.",
  },
  universe: universeFil,
  identity: identityFil,
  applicationIntro: {
    label: "Maligayang pagdating sa HackUniverse",
    loadingLabel: "Inihahanda ang iyong uniberso",
    detail: "Animasyon sa pagbubukas · 3 segundo.",
    preparingDetail: "Inihahanda ang tanawin…",
    entryDetail: "Isang buong unibersong matutuklasan. Pumasok upang simulan ang iyong paglalakbay na may tunog.",
    enter: "Pumasok sa uniberso",
  },
  notFound: {
    eyebrow: "Error 404 / Hindi nahanap ang pahina",
    title: "Hindi nahanap ang pahina.",
    description: "Wala ang pahinang ito o nailipat na ito. Bumalik sa panimula upang magpatuloy sa paggalugad.",
    home: "Bumalik sa panimula",
  },
  example: {
    eyebrow: "Isang bagong pananaw",
    title: "Dito nagsisimula ang iyong uniberso.",
    description: "Isang lugar para sa iyong mga tuklas. Sa iyong wika.",
    noteLabel: "Subukang magsulat",
    notePlaceholder: "Isang kaisipan, isang ideya, isang bagong mundo…",
    noteHint: "Mananatili rito ang iyong teksto kapag pinalitan mo ang wika.",
    planets: { one: "{count} planeta", other: "{count} planeta" },
  },
} satisfies Messages;

export default fil;
