import { universePtBR } from "@/modules/universe/messages";
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
  universe: universePtBR,
  applicationIntro: {
    label: "Bem-vindo ao HackUniverse",
    detail: "Seu universo começa aqui.",
  },
  notFound: {
    eyebrow: "Erro 404 / Rota não encontrada",
    title: "Página não encontrada.",
    description: "Esta página não existe ou mudou de endereço. Volte ao início para continuar explorando.",
    home: "Voltar ao início",
  },
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
