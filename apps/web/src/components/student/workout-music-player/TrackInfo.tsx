import { playableMediaUrl } from "../../../lib/urls";

type Props = {
  title: string;
  subtitle: string;
  coverUrl: string | null;
  playing?: boolean;
  onOpen?: () => void;
};

export function TrackInfo({ title, subtitle, coverUrl, playing = false, onOpen }: Props) {
  const cover = coverUrl ? playableMediaUrl(coverUrl) : "";
  const coverStyle = cover ? { backgroundImage: `url(${cover})` } : undefined;

  return (
    <button
      className={`workout-music-track${playing ? " is-playing" : ""}`}
      onClick={onOpen}
      type="button"
      aria-label="Ver álbuns disponíveis"
      disabled={!onOpen}
    >
      <span className="workout-music-cover" style={coverStyle} />
      <span className="workout-music-meta">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </span>
    </button>
  );
}
