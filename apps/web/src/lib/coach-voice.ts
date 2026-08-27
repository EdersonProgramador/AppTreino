type RecCtor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export function speakCoachWeb(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text.replace(/\*\*/g, ""));
  utter.lang = "pt-BR";
  utter.rate = 1.02;
  window.speechSynthesis.speak(utter);
}

export function stopCoachWeb() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}

export function listenCoachWeb(): Promise<string> {
  const ctor = (window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor })
    .SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: RecCtor }).webkitSpeechRecognition;
  if (!ctor) {
    return Promise.reject(new Error("Este navegador não reconhece fala. Use Chrome ou o app nativo."));
  }
  return new Promise((resolve, reject) => {
    const rec = new ctor();
    rec.lang = "pt-BR";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript?.trim();
      if (text) resolve(text);
      else reject(new Error("Não entendi. Tente de novo."));
    };
    rec.onerror = () => reject(new Error("Não foi possível ouvir. Permita o microfone."));
    rec.onend = () => undefined;
    rec.start();
  });
}