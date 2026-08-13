import type { ImgHTMLAttributes } from "react";
import { mediaUrl } from "../../lib/urls";

type MediaImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null;
  /** reservado — thumbs derivados ficam desligados para não quebrar mídias cadastradas */
  width?: number;
  quality?: number;
  priority?: boolean;
};

/** Imagem com lazy decode; usa o arquivo/URL original cadastrado. */
export function MediaImg({
  src,
  width: _width,
  quality: _quality,
  priority = false,
  alt = "",
  loading,
  decoding,
  ...rest
}: MediaImgProps) {
  const resolved = mediaUrl(src);

  if (!resolved) return null;

  return (
    <img
      src={resolved}
      alt={alt}
      loading={loading ?? (priority ? "eager" : "lazy")}
      decoding={decoding ?? "async"}
      {...rest}
    />
  );
}
