import type { AudioCopy } from "./types";
const ptBR = {
  title: "Som",
  introduction: "Uma trilha original e sons sutis da interface. O som começa somente quando você o ativa.",
  music: "Música", effects: "Efeitos sonoros", enableMusic: "Ativar música", disableMusic: "Desligar música", startMusic: "Retomar música",
  enableEffects: "Ativar efeitos", disableEffects: "Desligar efeitos", startEffects: "Retomar efeitos",
  musicVolume: "Volume da música", effectsVolume: "Volume dos efeitos", retry: "Tentar o som novamente",
  savedGesture: "Suas escolhas estão salvas. Pressione Retomar para iniciar o som nesta visita.",
  preferenceError: "Não foi possível salvar suas escolhas de som. Elas continuam válidas nesta visita.",
  statuses: { off: "Desligado", idle: "Aguardando sua permissão", loading: "Carregando…", playing: "Reproduzindo", ready: "Pronto", paused: "Pausado", error: "Indisponível" },
  errors: { blocked: "Seu navegador bloqueou a reprodução. Tente novamente para permitir o som.", unavailable: "O áudio está indisponível neste navegador. Você pode continuar sem ele.", load: "Não foi possível carregar ou reproduzir este áudio. Confira sua conexão e tente novamente." },
} satisfies AudioCopy;
export default ptBR;
