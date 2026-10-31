import type en from "./en";

const fil = {
  eyebrow: "Account / Pasilip",
  title: "Mag-sign in",
  description: "Isang lugar para sa sarili mong mga tuklas.",
  close: "Isara ang dialog ng pag-sign in",
  preview: "Pasilip lang ito. Hindi pa nakakonekta ang pag-sign in. Gumamit ng mga halimbawang halaga; walang ipapadala o ise-save.",
  google: "Magpatuloy gamit ang Google",
  or: "o gumamit ng email",
  email: "Email",
  emailPlaceholder: "explorer@example.com",
  password: "Password",
  passwordPlaceholder: "Halimbawang password",
  showPassword: "Ipakita ang password",
  hidePassword: "Itago ang password",
  emailAction: "Silipin ang pag-sign in",
  googleNotice: "Magagamit ang pag-sign in gamit ang Google kapag nakakonekta na ang pag-access sa account. Ginagalugad mo pa rin ang demonstrasyon.",
  emailNotice: "Hindi pa nakakonekta ang pag-sign in gamit ang email. Walang ginawang account o sesyon.",
} satisfies Record<keyof typeof en, string>;

export default fil;
