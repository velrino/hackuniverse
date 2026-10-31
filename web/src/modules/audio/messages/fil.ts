import type { AudioCopy } from "./types";

const fil = {
  title: "Tunog",
  introduction: "Magsisimula ang musika at mga epekto kapag pinayagan ng iyong browser. Naka-save ang iyong mga pagpili at lakas ng tunog.",
  music: "Musika", effects: "Mga epektong pantunog",
  muteSound: "Patahimikin ang tunog", enableSound: "I-on ang tunog", muted: "Nakapatahimik",
  mutedHint: "Nakapatahimik ang tunog. Ibinabalik ng pindutan ng speaker ang naka-save mong mga setting ng musika at mga epekto.",
  musicVolume: "Lakas ng musika", effectsVolume: "Lakas ng mga epekto", retry: "Subukang muli ang tunog",
  waiting: "Naghihintay ng pakikipag-ugnayan",
  gestureHint: "Mag-tap o pumindot ng key sa labas ng mga kontrol ng tunog upang payagan ang pagtugtog. Mananatiling naka-off ang mga channel na pinatay mo.",
  preferenceError: "Hindi maibalik o ma-save ang iyong mga pagpili sa tunog. Sa pagbisitang ito lang ilalapat ang kasalukuyang mga setting.",
  statuses: { off: "Naka-off", idle: "Naghihintay magsimula", loading: "Naglo-load…", playing: "Tumutugtog", ready: "Handa", paused: "Naka-pause", error: "Hindi magagamit" },
  errors: { blocked: "Naghihintay ang iyong browser ng pakikipag-ugnayan bago magpatugtog.", unavailable: "Hindi magagamit ang audio sa browser na ito. Maaari kang magpatuloy nang walang tunog.", load: "Hindi ma-load o mapatugtog ang audio na ito. Suriin ang iyong koneksiyon at subukan muli." },
} satisfies AudioCopy;

export default fil;
