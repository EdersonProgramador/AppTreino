import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: ReactNode;
  active?: boolean;
  tone?: "music" | "workout";
};

export function ControlButton({
  label,
  icon,
  active = false,
  tone = "music",
  className = "",
  ...props
}: Props) {
  return (
    <button
      {...props}
      className={`workout-music-ctrl workout-music-ctrl--${tone}${active ? " is-active" : ""} ${className}`.trim()}
      type="button"
      title={label}
    >
      <span className="workout-music-ctrl-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="workout-music-ctrl-label">{label}</span>
    </button>
  );
}
