import type { AudioCopy } from "./types";
const ptBR = {
  title: "Som",
  introduction: "Música e efeitos começam quando o navegador permite. Suas chaves e volumes ficam salvos.",
  music: "Música", effects: "Efeitos sonoros",
  musicVolume: "Volume da música", effectsVolume: "Volume dos efeitos", retry: "Tentar o som novamente",
  waiting: "Aguardando interação",
  gestureHint: "Toque ou pressione uma tecla fora dos controles de som para permitir a reprodução. Canais desativados continuam desligados.",
  preferenceError: "Não foi possível restaurar ou salvar suas escolhas de som. As configurações atuais valem nesta visita.",
  statuses: { off: "Desligado", idle: "Aguardando início", loading: "Carregando…", playing: "Reproduzindo", ready: "Pronto", paused: "Pausado", error: "Indisponível" },
  errors: { blocked: "Seu navegador aguarda uma interação antes de reproduzir o som.", unavailable: "O áudio está indisponível neste navegador. Você pode continuar sem ele.", load: "Não foi possível carregar ou reproduzir este áudio. Confira sua conexão e tente novamente." },
} satisfies AudioCopy;
export default ptBR;
