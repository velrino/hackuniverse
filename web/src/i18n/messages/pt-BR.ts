import { designSystemPtBR } from "@/modules/design-system/messages";
import type { Messages } from "../messages";

const ptBR = {
  common: {
    home: "Início",
    example: "Outra página",
    designSystem: "Sistema de design",
    navigation: "Navegação principal",
    changeLanguage: "Mudar idioma",
    close: "Fechar",
    pageTitle: "HackUniverse · Seu universo começa aqui",
  },
  languageDialog: {
    title: "Escolha seu idioma",
    description: "Sinta-se em casa. Escolha como explorar o HackUniverse.",
    current: "Idioma atual",
    choose: "Escolher idioma",
    hint: "Você pode mudar seu idioma a qualquer momento.",
  },
  designSystem: designSystemPtBR,
  example: {
    eyebrow: "Uma nova perspectiva",
    title: "Seu universo começa aqui.",
    description: "Um lugar para suas descobertas. No seu idioma.",
    noteLabel: "Experimente escrever algo",
    notePlaceholder: "Um pensamento, uma ideia, um novo mundo…",
    noteHint: "Seu texto continua aqui quando você muda o idioma.",
    planets: { one: "{count} planeta", other: "{count} planetas" },
  },
} satisfies Messages;

export default ptBR;
