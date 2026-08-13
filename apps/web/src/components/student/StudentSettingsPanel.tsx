import {
  FiVolume2,
  FiVolumeX,
  FiSettings,
  FiChevronLeft
} from "react-icons/fi";
import { useUiPrefsStore } from "../../stores/uiPrefsStore";
import { uiSounds } from "../../lib/ui-sounds";
import { ThemeModeSwitch } from "../shared/ThemeModeSwitch";

type StudentSettingsPanelProps = {
  onBack: () => void;
};

const SoundToggle = ({
  active,
  onToggle
}: {
  active: boolean;
  onToggle: () => void;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={active}
    onClick={onToggle}
    className={`group relative flex w-full items-center justify-between gap-4 rounded-2xl border px-5 py-4 text-left transition duration-300 ${
      active
        ? "border-brand-gold/40 bg-gradient-to-r from-brand-gold/20 via-brand-coral/10 to-transparent shadow-glow"
        : "border-[color:var(--app-border)] bg-[color:var(--app-elev)] hover:border-[color:var(--app-border-strong)]"
    }`}
  >
    <span className="flex min-w-0 items-center gap-3">
      <span
        className={`grid h-11 w-11 place-items-center rounded-xl ${
          active ? "bg-brand-gold/20 text-brand-gold" : "bg-[var(--app-fill)] text-[color:var(--app-text-muted)]"
        }`}
      >
        {active ? <FiVolume2 size={22} /> : <FiVolumeX size={22} />}
      </span>
      <span className="grid min-w-0 gap-0.5">
        <strong className="text-base font-extrabold text-[color:var(--app-text)]">
          {active ? "Com efeitos sonoros" : "Sem efeitos sonoros"}
        </strong>
        <span className="text-sm text-[color:var(--app-text-faint)]">{active ? "Ativado" : "Desativado"}</span>
      </span>
    </span>
    <span
      className={`relative h-8 w-14 shrink-0 rounded-full p-1 transition ${
        active ? "bg-gradient-to-r from-brand-teal to-brand-mint" : "bg-[var(--app-fill-strong)]"
      }`}
    >
      <span
        className={`block h-6 w-6 rounded-full shadow transition ${
          active
            ? "translate-x-6 bg-[color:var(--app-panel)]"
            : "translate-x-0 bg-[color:var(--app-panel)] ring-1 ring-[color:var(--app-border)]"
        }`}
      />
    </span>
  </button>
);

export const StudentSettingsPanel = ({ onBack }: StudentSettingsPanelProps) => {
  const soundEnabled = useUiPrefsStore((state) => state.soundEnabled);
  const setSoundEnabled = useUiPrefsStore((state) => state.setSoundEnabled);

  const handleSoundToggle = () => {
    const next = !soundEnabled;
    if (next) {
      setSoundEnabled(true);
      uiSounds.toggleOn();
    } else {
      uiSounds.toggleOff();
      setSoundEnabled(false);
    }
  };

  return (
    <section
      className="animate-fade-up mx-auto grid w-full max-w-2xl gap-6 p-4 sm:p-6 md:p-8"
      aria-label="Configurações do aluno"
    >
      <header className="relative overflow-hidden rounded-3xl border border-[color:var(--app-border)] bg-gradient-to-br from-[var(--app-elev)] via-[var(--app-panel)] to-[var(--app-bg-soft)] p-6 sm:p-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(circle at 12% 20%, rgba(240,180,90,0.28), transparent 42%), radial-gradient(circle at 88% 10%, rgba(224,106,60,0.22), transparent 40%)"
          }}
        />
        <div className="relative grid gap-4">
          <button
            type="button"
            onClick={() => {
              uiSounds.popupClose();
              onBack();
            }}
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-[color:var(--app-border)] bg-[var(--app-fill)] px-3 py-2 text-sm font-bold text-sand-muted transition hover:border-[color:var(--app-border-strong)] hover:text-sand"
          >
            <FiChevronLeft size={18} />
            Voltar
          </button>
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-gold/15 text-brand-gold">
              <FiSettings size={24} />
            </span>
            <div className="grid gap-1">
              <span className="text-xs font-extrabold uppercase tracking-[0.18em] text-brand-gold">preferências</span>
              <h2 className="font-display m-0 text-3xl font-bold tracking-tight text-sand sm:text-4xl">Configurações</h2>
              <p className="m-0 max-w-md text-sm text-sand-muted">
                Modo Claro/Escuro e efeitos sonoros do portal do aluno.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-4 rounded-3xl border border-[color:var(--app-border)] bg-[color:var(--app-panel)] p-4 sm:p-6">
        <ThemeModeSwitch />
      </div>

      <div className="grid gap-4 rounded-3xl border border-[color:var(--app-border)] bg-[color:var(--app-panel)] p-4 sm:p-6">
        <div className="grid gap-1 px-1">
          <h3 className="m-0 text-lg font-extrabold text-sand">Efeitos sonoros</h3>
          <p className="m-0 text-sm text-sand-faint">
            Feedbacks de navegação, pagamento, treino e popups (react-sounds + howler).
          </p>
        </div>
        <SoundToggle active={soundEnabled} onToggle={handleSoundToggle} />
      </div>
    </section>
  );
};
