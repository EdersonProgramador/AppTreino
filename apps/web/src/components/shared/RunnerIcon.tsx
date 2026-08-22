import type { HTMLAttributes } from "react";

type Gender = "MALE" | "FEMALE" | null | undefined;

const MALE_SRC = "/assets/corrida-homem-mask.png";
const FEMALE_SRC = "/assets/corrida-mulher-mask.png";

/** Ícone de corrida por sexo do atleta (homem / mulher). */
export function RunnerIcon({
  size = 22,
  gender,
  className,
  strokeWidth: _strokeWidth,
  style,
  ...props
}: {
  size?: number;
  gender?: Gender;
  /** Aceito só para compatibilidade com ícones Lucide. */
  strokeWidth?: number;
} & HTMLAttributes<HTMLSpanElement>) {
  const src = gender === "FEMALE" ? FEMALE_SRC : MALE_SRC;
  return (
    <span
      className={`runner-gender-icon${className ? ` ${className}` : ""}`}
      style={{
        width: size,
        height: size,
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        ...style
      }}
      aria-hidden
      {...props}
    />
  );
}

export function corridaIconSrc(gender?: Gender) {
  return gender === "FEMALE" ? FEMALE_SRC : MALE_SRC;
}
