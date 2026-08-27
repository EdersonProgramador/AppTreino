import { Mic, Send } from "lucide-react";
import { FormEvent, useState } from "react";
import { ApiError, apiPost } from "../../api";
import { listenCoachWeb, speakCoachWeb, stopCoachWeb } from "../../lib/coach-voice";
import { uiSounds } from "../../lib/ui-sounds";
import { fetchWeatherHere } from "../../lib/weather";

type Message = { role: "coach" | "me"; text: string };

type CoachChatResponse = {
  reply: string;
  source: "llm" | "local";
  savedPlanId?: string | null;
};

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
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "coach",
      text: `Olá, ${firstName}. Eu sou o Coach AppTreino. Posso montar treino, dieta pelo biotipo e te acompanhar por chat ou voz. Como você quer treinar hoje?`
    }
  ]);

  async function ask(text: string, speak = false) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setDraft("");
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

  async function requestVoice() {
    stopCoachWeb();
    setListening(true);
    uiSounds.popupOpen();
    try {
      const text = await listenCoachWeb();
      await ask(text, true);
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "Não foi possível ouvir.");
    } finally {
      setListening(false);
    }
  }

  return (
    <article className="student-ai-chat">
      <strong>Conversa com o coach</strong>
      <div className="student-ai-chat-log">
        {messages.map((item, index) => (
          <p key={`${item.role}-${index}`} className={item.role === "me" ? "is-me" : "is-coach"}>
            {item.text}
          </p>
        ))}
        {busy ? <p className="is-coach">Coach pensando…</p> : null}
      </div>
      <form className="student-ai-chat-compose" onSubmit={send}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Escreva para o coach…"
          disabled={busy}
        />
        <button type="submit" className="student-green-button" aria-label="Enviar" disabled={busy}>
          <Send size={16} />
          Enviar
        </button>
        <button type="button" className="student-outline-button" onClick={() => void requestVoice()} disabled={busy}>
          <Mic size={16} />
          {listening ? "Ouvindo…" : "Falar"}
        </button>
      </form>
    </article>
  );
}
