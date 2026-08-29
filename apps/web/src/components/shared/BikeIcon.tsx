import type { HTMLAttributes } from "react";

const SRC = "/assets/ciclismo-mask.svg";

/** Bicicleta preenchida, no mesmo sistema de máscara da corrida. */
export function BikeIcon({
  size = 22,
  className,
  strokeWidth: _strokeWidth,
  style,
  ...props
}: {
  size?: number;
  strokeWidth?: number;
} & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`runner-gender-icon${className ? ` ${className}` : ""}`}
      style={{
        width: size,
        height: size,
        WebkitMaskImage: `url(${SRC}?v=1)`,
        maskImage: `url(${SRC}?v=1)`,
        ...style
      }}
      aria-hidden
      {...props}
    />
  );
}

export function ciclismoIconSrc() {
  return SRC;
}
