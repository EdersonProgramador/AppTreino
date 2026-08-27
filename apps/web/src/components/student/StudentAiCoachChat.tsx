import { ArrowUp, Mic, Square, Volume2 } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { ApiError, apiGet, apiPost, apiUpload } from "../../api";
import {
  listenCoachWeb,
  speakCoachWeb,
  startCoachWebRecording,
  stopCoachWeb,
  type CoachWebRecording
} from "../../lib/coach-voice";
import { uiSounds } from "../../lib/ui-sounds";
import { fetchWeatherHere } from "../../lib/weather";

type Message = { role: "coach" | "me"; text: string };

type CoachChatResponse = {
  reply: string;
  source: "llm" | "local";
  savedPlanId?: string | null;
};

const SUGGESTIONS = [
  "Tô sem tempo hoje, o que dá pra fazer?",
  "Monta um treino pra mim agora",
  "Como eu como nessa semana?"
];

function CoachMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : part
      )}
    </>
  );
}

export function StudentAiCoachChat({
  token,
  athleteName,
  onPlanSaved
}: {
  token: string;
  athleteName?: string | null;
  onPlanSaved?: () => void;
}) {
  const firstName = athleteName?.split(" ")[0] ?? "atleta";
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceReady, setVoiceReady] = useState(true);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "coach",
      text: `E aí, ${firstName}. Tô por aqui. Quer treinar hoje, organizar a semana ou falar de comida?`
    }
  ]);
  const logRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<CoachWebRecording | null>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, listening]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const path of ["/user/coach/status", "/student/coach/status"] as const) {
        try {
          const status = await apiGet<{ voice?: boolean }>(path, token);
          if (!cancelled) setVoiceReady(Boolean(status.voice));
          return;
        } catch (caught) {
          if (caught instanceof ApiError && caught.status === 404) continue;
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
      void recRef.current?.stop().catch(() => undefined);
    };
  }, [token]);

  function resizeDraft() {
    const box = boxRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 160)}px`;
  }

  async function ask(text: string, speak = false) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setDraft("");
    if (boxRef.current) boxRef.current.style.height = "auto";
    const history = [...messages, { role: "me" as const, text: trimmed }];
    setMessages(history);
    setBusy(true);
    try {
      const weather = await fetchWeatherHere("WORKOUT");
      let payload: CoachChatResponse | null = null;
      let lastError: unknown;
      for (const path of ["/user/coach/chat", "/student/coach/chat"] as const) {
        try {
          payload = await apiPost<CoachChatResponse>(
            path,
            {
              messages: history.map((item) => ({
                role: item.role === "me" ? "user" : "assistant",
                content: item.text
              })),
              weather: weather ? { tempC: weather.tempC, label: weather.label, code: weather.code } : undefined
            },
            token
          );
          break;
        } catch (caught) {
          lastError = caught;
          if (caught instanceof ApiError && caught.status === 404) continue;
          throw caught;
        }
      }
      if (!payload) throw lastError instanceof Error ? lastError : new Error("Coach IA indisponível.");
      setMessages((current) => [...current, { role: "coach", text: payload.reply }]);
      if (payload.savedPlanId) onPlanSaved?.();
      if (speak) speakCoachWeb(payload.reply);
      uiSounds.success();
    } catch {
      setMessages((current) => [
        ...current,
        { role: "coach", text: "Não consegui responder agora. Tente de novo em instantes." }
      ]);
      uiSounds.error();
    } finally {
      setBusy(false);
    }
  }

  function send(event?: FormEvent) {
    event?.preventDefault();
    void ask(draft);
  }

  function onDraftKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void ask(draft);
    }
  }

  async function transcribeBlob(blob: Blob) {
    const ext = blob.type.includes("mp4") ? "m4a" : "webm";
    const form = new FormData();
    form.append("file", new File([blob], `coach.${ext}`, { type: blob.type || "audio/webm" }));
    let lastError: unknown;
    for (const path of ["/user/coach/transcribe", "/student/coach/transcribe"] as const) {
      try {
        return await apiUpload<{ text: string }>(path, form, token);
      } catch (caught) {
        lastError = caught;
        if (caught instanceof ApiError && caught.status === 404) continue;
        throw caught;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Transcrição indisponível.");
  }

  async function finishVoiceFromWhisper() {
    const rec = recRef.current;
    recRef.current = null;
    setListening(false);
    if (!rec) return;
    const blob = await rec.stop();
    const transcribed = await transcribeBlob(blob);
    if (!transcribed.text?.trim()) throw new Error("Não entendi o áudio.");
    await ask(transcribed.text, true);
  }

  async function requestVoice() {
    stopCoachWeb();
    if (listening) {
      setBusy(true);
      try {
        await finishVoiceFromWhisper();
      } catch (caught) {
        setMessages((current) => [
          ...current,
          {
            role: "coach",
            text:
              caught instanceof Error
                ? caught.message
                : "Não deu para transcrever. Fale de novo ou escreva no chat."
          }
        ]);
        uiSounds.error();
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      if (voiceReady) {
        recRef.current = await startCoachWebRecording();
        setListening(true);
        uiSounds.popupOpen();
        return;
      }
      setListening(true);
      const text = await listenCoachWeb();
      setListening(false);
      await ask(text, true);
    } catch (caught) {
      recRef.current = null;
      setListening(false);
      setMessages((current) => [
        ...current,
        {
          role: "coach",
          text: caught instanceof Error ? caught.message : "Não foi possível ouvir. Permita o microfone."
        }
      ]);
      uiSounds.error();
    }
  }

  const showHints = messages.length <= 1 && !busy;

  return (
    <article className="coach-gpt">
      <header className="coach-gpt-top">
        <div className="coach-gpt-brand">
          <span className="coach-gpt-avatar" aria-hidden>
            AT
          </span>
          <div>
            <strong>Coach AppTreino</strong>
            <small>Especialista em treino e nutrição</small>
          </div>
        </div>
        <button
          type="button"
          className="coach-gpt-icon-btn"
          onClick={() => stopCoachWeb()}
          aria-label="Parar áudio"
          title="Parar áudio"
        >
          <Volume2 size={18} />
        </button>
      </header>
      <div className="coach-gpt-thread" ref={logRef}>
        {messages.map((item, index) => (
          <div key={`${item.role}-${index}`} className={`coach-gpt-row ${item.role === "me" ? "is-me" : "is-coach"}`}>
            {item.role === "coach" ? (
              <span className="coach-gpt-avatar is-sm" aria-hidden>
                AT
              </span>
            ) : (
              <span className="coach-gpt-avatar is-sm is-user" aria-hidden>
                {firstName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className={`coach-gpt-bubble ${item.role === "me" ? "is-me" : "is-coach"}`}>
              <CoachMarkdown text={item.text} />
            </div>
          </div>
        ))}
        {listening ? (
          <p className="coach-gpt-status">Ouvindo… toque no microfone de novo para enviar ao chat.</p>
        ) : null}
        {busy && !listening ? (
          <div className="coach-gpt-row is-coach">
            <span className="coach-gpt-avatar is-sm" aria-hidden>
              AT
            </span>
            <div className="coach-gpt-typing" aria-label="Coach pensando">
              <i />
              <i />
              <i />
            </div>
          </div>
        ) : null}
        {showHints ? (
          <div className="coach-gpt-hints">
            {SUGGESTIONS.map((item) => (
              <button key={item} type="button" onClick={() => void ask(item)} disabled={busy}>
                {item}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <form className="coach-gpt-dock" onSubmit={send}>
        <button
          type="button"
          className={`coach-gpt-icon-btn ${listening ? "is-live" : ""}`}
          onClick={() => void requestVoice()}
          disabled={busy && !listening}
          aria-label={listening ? "Parar e enviar voz" : "Falar"}
        >
          {listening ? <Square size={16} /> : <Mic size={18} />}
        </button>
        <textarea
          ref={boxRef}
          value={draft}
          rows={1}
          onChange={(event) => {
            setDraft(event.target.value);
            resizeDraft();
          }}
          onKeyDown={onDraftKey}
          placeholder="Mensagem para o Coach…"
          disabled={busy}
        />
        <button
          type="submit"
          className="coach-gpt-icon-btn is-send"
          aria-label="Enviar"
          disabled={busy || !draft.trim()}
        >
          <ArrowUp size={18} />
        </button>
      </form>
    </article>
  );
}
