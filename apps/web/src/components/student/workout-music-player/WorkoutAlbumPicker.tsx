import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Disc3, X } from "lucide-react";
import { apiGet } from "../../../api";
import { musicAudio } from "../../../lib/music-audio";
import { isNativeAppShell } from "../../../lib/native-bridge";
import { nativeOpenMusicQueue } from "../../../lib/native-music";
import { playableMediaUrl } from "../../../lib/urls";
import { useAuthStore } from "../../../stores/authStore";
import { useMusicPlayerStore, type MusicPlayTrack } from "../../../stores/musicPlayerStore";

type PlayAlbum = {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  tracks: MusicPlayTrack[];
};

type CatalogResponse = {
  albums: PlayAlbum[];
  singles: MusicPlayTrack[];
};

type Props = {
  open: boolean;
  onClose: () => void;
};

function withAlbumMeta(album: PlayAlbum): MusicPlayTrack[] {
  return album.tracks.map((track) => ({
    ...track,
    coverUrl: track.coverUrl || album.coverUrl,
    artist: track.artist || album.title,
    albumId: album.id
  }));
}

function playTracks(tracks: MusicPlayTrack[], startIndex = 0) {
  if (!tracks.length) return;
  const safeIndex = Math.min(Math.max(0, startIndex), tracks.length - 1);

  if (isNativeAppShell()) {
    musicAudio.stop();
    useMusicPlayerStore.getState().armQueue(tracks, safeIndex, { expand: false });
    const opened = nativeOpenMusicQueue(
      useMusicPlayerStore.getState().queue,
      useMusicPlayerStore.getState().index
    );
    if (!opened) {
      useMusicPlayerStore.getState().reset();
      return;
    }
    useMusicPlayerStore.setState({ playing: true });
    return;
  }

  const track = tracks[safeIndex];
  if (!track?.audioUrl) return;

  const state = useMusicPlayerStore.getState();
  const volume = state.volume > 0.05 && !state.muted ? state.volume : 0.85;
  if (state.muted || state.volume <= 0.05) {
    useMusicPlayerStore.setState({ muted: false, volume });
  }

  const playPromise = musicAudio.playNow(track.audioUrl, volume);
  useMusicPlayerStore.getState().armQueue(tracks, safeIndex, { expand: false });
  void playPromise
    .then(() => useMusicPlayerStore.setState({ playing: true }))
    .catch(() => useMusicPlayerStore.setState({ playing: false }));
}

export function WorkoutAlbumPicker({ open, onClose }: Props) {
  const token = useAuthStore((state) => state.token);
  const currentAlbumId = useMusicPlayerStore((state) => state.queue[state.index]?.albumId ?? null);
  const [albums, setAlbums] = useState<PlayAlbum[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setError("Faça login para ver os álbuns.");
      setAlbums([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const catalog = await apiGet<CatalogResponse>("/student/music/catalog", token);
      setAlbums(catalog.albums);
    } catch {
      setError("Não foi possível carregar os álbuns.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="workout-album-picker-backdrop" onClick={onClose} role="presentation">
      <section
        aria-label="Álbuns disponíveis"
        aria-modal="true"
        className="workout-album-picker"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="workout-album-picker-header">
          <div>
            <strong>Álbuns</strong>
            <span>Escolha a trilha do treino</span>
          </div>
          <button aria-label="Fechar álbuns" onClick={onClose} type="button">
            <X size={20} />
          </button>
        </header>

        <div className="workout-album-picker-list">
          {loading ? <p className="workout-album-picker-status">Carregando álbuns…</p> : null}
          {!loading && error ? <p className="workout-album-picker-status is-error">{error}</p> : null}
          {!loading && !error && albums.length === 0 ? (
            <p className="workout-album-picker-status">Nenhum álbum disponível.</p>
          ) : null}
          {!loading &&
            !error &&
            albums.map((album) => {
              const active = currentAlbumId === album.id;
              return (
                <button
                  className={`workout-album-picker-item${active ? " is-active" : ""}`}
                  key={album.id}
                  onClick={() => {
                    playTracks(withAlbumMeta(album), 0);
                    onClose();
                  }}
                  type="button"
                >
                  <span className="workout-album-picker-cover">
                    {album.coverUrl ? (
                      <img alt="" src={playableMediaUrl(album.coverUrl)} />
                    ) : (
                      <Disc3 size={22} />
                    )}
                  </span>
                  <span className="workout-album-picker-meta">
                    <strong>{album.title}</strong>
                    <span>
                      {album.tracks.length} faixa{album.tracks.length === 1 ? "" : "s"}
                      {album.description ? ` · ${album.description}` : ""}
                    </span>
                  </span>
                </button>
              );
            })}
        </div>
      </section>
    </div>,
    document.body
  );
}
