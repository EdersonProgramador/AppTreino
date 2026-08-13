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
    <div
      className={`theme-mode-switch ${compact ? "theme-mode-switch-compact" : "grid gap-3"} ${className}`}
      role="group"
      aria-label="Modo Claro ou Escuro"
    >
      {!compact && (
        <div className="grid gap-1">
          <h3 className="theme-mode-title m-0 text-lg font-extrabold">Aparência</h3>
          <p className="theme-mode-copy m-0 text-sm">Escolha o modo Claro ou Escuro do sistema.</p>
        </div>
      )}
      <div className={`theme-mode-options ${compact ? "theme-mode-options-compact" : ""}`}>
        <button
          type="button"
          aria-label="Modo claro"
          aria-pressed={theme === "light"}
          title="Claro"
          onClick={() => selectTheme("light")}
          className={`theme-mode-option theme-mode-option-light ${theme === "light" ? "is-active" : ""}`}
        >
          <FiSun size={compact ? 16 : 18} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Modo escuro"
          aria-pressed={theme === "dark"}
          title="Escuro"
          onClick={() => selectTheme("dark")}
          className={`theme-mode-option theme-mode-option-dark ${theme === "dark" ? "is-active" : ""}`}
        >
          <FiMoon size={compact ? 16 : 18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
