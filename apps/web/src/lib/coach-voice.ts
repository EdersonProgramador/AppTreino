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

function speechCtor() {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: RecCtor }).webkitSpeechRecognition ||
    null
  );
}

export function canUseWebSpeech() {
  return Boolean(speechCtor());
}

export function listenCoachWeb(): Promise<string> {
  const ctor = speechCtor();
  if (!ctor) {
    return Promise.reject(new Error("Este navegador não reconhece fala. Use o microfone com Whisper ou o app nativo."));
  }
  return new Promise((resolve, reject) => {
    const rec = new ctor();
    rec.lang = "pt-BR";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let settled = false;
    rec.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript?.trim();
      settled = true;
      if (text) resolve(text);
      else reject(new Error("Não entendi. Tente de novo."));
    };
    rec.onerror = () => {
      if (settled) return;
      settled = true;
      reject(new Error("Não foi possível ouvir. Permita o microfone."));
    };
    rec.onend = () => {
      if (settled) return;
      settled = true;
      reject(new Error("Não entendi. Fale de novo e solte o microfone."));
    };
    rec.start();
  });
}

export type CoachWebRecording = {
  stream: MediaStream;
  mimeType: string;
  startedAt: number;
  stop: () => Promise<Blob>;
};

export async function startCoachWebRecording(): Promise<CoachWebRecording> {
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este navegador não grava áudio. Escreva no chat ou use o Chrome.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start();
  return {
    stream,
    mimeType: recorder.mimeType || mimeType || "audio/webm",
    startedAt: Date.now(),
    stop() {
      return new Promise((resolve, reject) => {
        const finish = () => {
          stream.getTracks().forEach((track) => track.stop());
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          if (blob.size < 800) reject(new Error("Áudio muito curto. Segure o microfone, fale e solte."));
          else resolve(blob);
        };
        recorder.onerror = () => {
          stream.getTracks().forEach((track) => track.stop());
          reject(new Error("Falha ao gravar o áudio."));
        };
        if (recorder.state === "inactive") {
          finish();
          return;
        }
        recorder.onstop = finish;
        recorder.stop();
      });
    }
  };
}
