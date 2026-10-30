import type en from "./en";

const ptBR = {
  eyebrow: "Conta / Prévia",
  title: "Entrar",
  description: "Um lugar para suas próprias descobertas.",
  close: "Fechar diálogo de acesso",
  preview: "Apenas uma prévia. O acesso não está conectado. Use valores de exemplo; nada é enviado ou salvo.",
  google: "Continuar com Google",
  or: "ou use email",
  email: "Email",
  emailPlaceholder: "explorador@exemplo.com",
  password: "Senha",
  passwordPlaceholder: "Senha de exemplo",
  showPassword: "Mostrar senha",
  hidePassword: "Ocultar senha",
  emailAction: "Prévia de acesso",
  googleNotice: "O acesso com Google estará disponível quando a conta estiver conectada. Você continua na demonstração.",
  emailNotice: "O acesso por email ainda não está conectado. Nenhuma conta ou sessão foi criada.",
} satisfies Record<keyof typeof en, string>;

export default ptBR;
