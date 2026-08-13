import { FiMoon, FiSun } from "react-icons/fi";
import { useUiPrefsStore, type UiTheme } from "../../stores/uiPrefsStore";
import { uiSounds } from "../../lib/ui-sounds";

type ThemeModeSwitchProps = {
  className?: string;
  compact?: boolean;
};

export const ThemeModeSwitch = ({ className = "", compact = false }: ThemeModeSwitchProps) => {
  const theme = useUiPrefsStore((state) => state.theme);
  const setTheme = useUiPrefsStore((state) => state.setTheme);
  const soundEnabled = useUiPrefsStore((state) => state.soundEnabled);

  const selectTheme = (next: UiTheme) => {
    if (next === theme) return;
    setTheme(next);
    if (soundEnabled) {
      next === "dark" ? uiSounds.toggleOn() : uiSounds.toggleOff();
    }
  };

  return (
    <div className={`theme-mode-switch grid gap-3 ${className}`} role="group" aria-label="Modo Claro ou Escuro">
      {!compact && (
        <div className="grid gap-1">
          <h3 className="theme-mode-title m-0 text-lg font-extrabold">Aparência</h3>
          <p className="theme-mode-copy m-0 text-sm">Escolha o modo Claro ou Escuro do sistema.</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          aria-pressed={theme === "light"}
          onClick={() => selectTheme("light")}
          className={`theme-mode-option theme-mode-option-light flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-extrabold transition duration-300 ease-theme ${
            theme === "light" ? "is-active" : ""
          }`}
        >
          <FiSun size={18} />
          Claro
        </button>
        <button
          type="button"
          aria-pressed={theme === "dark"}
          onClick={() => selectTheme("dark")}
          className={`theme-mode-option theme-mode-option-dark flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-extrabold transition duration-300 ease-theme ${
            theme === "dark" ? "is-active" : ""
          }`}
        >
          <FiMoon size={18} />
          Escuro
        </button>
      </div>
    </div>
  );
};
