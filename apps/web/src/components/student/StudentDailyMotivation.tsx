import { Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { hasSeenTodayMotivation, markTodayMotivationSeen, motivationForToday } from "../../lib/daily-motivation";
import { uiSounds } from "../../lib/ui-sounds";

export function StudentDailyMotivation() {
  const [open, setOpen] = useState(false);
  const message = motivationForToday();

  useEffect(() => {
    if (!hasSeenTodayMotivation()) {
      setOpen(true);
      uiSounds.popupOpen();
    }
  }, []);

  function dismiss() {
    markTodayMotivationSeen();
    uiSounds.popupClose();
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="student-motivation-backdrop" role="presentation" onClick={dismiss}>
      <article className="student-motivation-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <header>
          <Sparkles size={18} />
          <small>{message.kicker}</small>
          <button type="button" aria-label="Fechar" onClick={dismiss}>
            <X size={16} />
          </button>
        </header>
        <h2>{message.title}</h2>
        <p>{message.body}</p>
        <div>
          <small>Âncora de hoje</small>
          <p>{message.anchor}</p>
        </div>
        <button type="button" className="student-green-button" onClick={dismiss}>
          Entendi · bora treinar
        </button>
        <em>Some depois que você vê. Volta amanhã com outra mensagem.</em>
      </article>
    </div>
  );
}
