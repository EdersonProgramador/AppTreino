import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Disc3, Heart, Music2, Pause, Play, Search, Shuffle } from "lucide-react";
import { apiGet } from "../../api";
import { useMusicPlayerStore, type MusicPlayTrack } from "../../stores/musicPlayerStore";

export type PlayTrack = MusicPlayTrack;

type PlayAlbum = {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  tracks: PlayTrack[];
};

type CatalogResponse = {
  albums: PlayAlbum[];
  singles: PlayTrack[];
};

type Props = {
  token: string;
};

function resolveMediaUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `${window.location.origin}${url}`;
  return url;
}

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function coverStyle(url: string | null | undefined) {
  return url ? { backgroundImage: `url(${resolveMediaUrl(url)})` } : undefined;
}

function withAlbumMeta(album: PlayAlbum): PlayTrack[] {
  return album.tracks.map((track) => ({
    ...track,
    coverUrl: track.coverUrl || album.coverUrl,
    artist: track.artist || album.title,
    albumId: album.id
  }));
}

export function StudentPlaySection({ token }: Props) {
  const [albums, setAlbums] = useState<PlayAlbum[]>([]);
  const [singles, setSingles] = useState<PlayTrack[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [openAlbumId, setOpenAlbumId] = useState<string | null>(null);
  const queue = useMusicPlayerStore((state) => state.queue);
  const index = useMusicPlayerStore((state) => state.index);
  const playing = useMusicPlayerStore((state) => state.playing);
  const likedIds = useMusicPlayerStore((state) => state.likedIds);
  const startQueue = useMusicPlayerStore((state) => state.startQueue);
  const expand = useMusicPlayerStore((state) => state.expand);
  const expanded = useMusicPlayerStore((state) => state.expanded);
  const toggleLike = useMusicPlayerStore((state) => state.toggleLike);
  const current = queue[index] ?? null;

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom treino pela manhã";
    if (hour < 18) return "Sua trilha da tarde";
    return "Energia para a noite";
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const catalog = await apiGet<CatalogResponse>("/student/music/catalog", token);
      setAlbums(catalog.albums);
      setSingles(catalog.singles);
    } catch {
      setError("Não foi possível carregar o Play.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const allTracks = useMemo(() => {
    const fromAlbums = albums.flatMap((album) => withAlbumMeta(album));
    return [...fromAlbums, ...singles];
  }, [albums, singles]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredAlbums = useMemo(() => {
    if (!normalizedQuery) return albums;
    return albums.filter(
      (album) =>
        album.title.toLowerCase().includes(normalizedQuery) ||
        (album.description ?? "").toLowerCase().includes(normalizedQuery)
    );
  }, [albums, normalizedQuery]);

  const filteredTracks = useMemo(() => {
    if (!normalizedQuery) return allTracks;
    return allTracks.filter(
      (track) =>
        track.title.toLowerCase().includes(normalizedQuery) ||
        (track.artist ?? "").toLowerCase().includes(normalizedQuery)
    );
  }, [allTracks, normalizedQuery]);

  const likedTracks = useMemo(
    () => allTracks.filter((track) => likedIds.includes(track.id)),
    [allTracks, likedIds]
  );

  const featuredAlbum = albums[0] ?? null;
  const openAlbum = albums.find((album) => album.id === openAlbumId) ?? null;
  const featuredCover = current?.coverUrl || featuredAlbum?.coverUrl || allTracks[0]?.coverUrl || null;

  function playTracks(tracks: PlayTrack[], startIndex = 0, shuffled = false) {
    startQueue(tracks, startIndex, { expand: true, ...(shuffled ? { shuffle: true } : {}) });
  }

  function playAlbum(album: PlayAlbum, startIndex = 0, shuffled = false) {
    playTracks(withAlbumMeta(album), startIndex, shuffled);
  }

  return (
    <section className="student-play-shell" aria-label="Play">
      <div
        className="student-play-ambiance"
        style={featuredCover ? { backgroundImage: `url(${resolveMediaUrl(featuredCover)})` } : undefined}
        aria-hidden
      />
      <div className="student-play-ambiance-veil" aria-hidden />

      <div className="student-play-content">
        {openAlbum ? (
          <div className="student-play-album-page">
            <button className="student-play-back" onClick={() => setOpenAlbumId(null)} type="button">
              <ChevronLeft size={18} />
              Biblioteca
            </button>
            <div className="student-play-album-hero">
              <div className="student-play-album-hero-cover" style={coverStyle(openAlbum.coverUrl)}>
                {!openAlbum.coverUrl && <Disc3 size={48} />}
              </div>
              <div>
                <span>Album</span>
                <h2>{openAlbum.title}</h2>
                <p>{openAlbum.description || `${openAlbum.tracks.length} faixas para o treino`}</p>
                <div className="student-play-hero-actions">
                  <button className="student-play-cta" onClick={() => playAlbum(openAlbum)} type="button">
                    <Play size={18} fill="currentColor" />
                    Tocar
                  </button>
                  <button className="student-play-ghost" onClick={() => playAlbum(openAlbum, 0, true)} type="button">
                    <Shuffle size={16} />
                    Aleatório
                  </button>
                </div>
              </div>
            </div>
            <div className="student-play-tracks">
              {withAlbumMeta(openAlbum).map((track, trackIndex) => {
                const active = current?.id === track.id;
                return (
                  <button
                    className={`student-play-track${active ? " is-active" : ""}${active && playing ? " is-playing" : ""}`}
                    key={track.id}
                    onClick={() => playAlbum(openAlbum, trackIndex)}
                    type="button"
                  >
                    <span className="student-play-track-index">
                      {active && playing ? <span className="student-play-eq" aria-hidden /> : trackIndex + 1}
                    </span>
                    <span className="student-play-track-meta">
                      <strong>{track.title}</strong>
                      <small>{track.artist || openAlbum.title}</small>
                    </span>
                    <span className="student-play-track-duration">
                      {track.durationSec != null ? formatClock(track.durationSec) : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            <header className="student-play-hero">
              <div className="student-play-hero-copy">
                <p className="student-play-kicker">
                  <Music2 size={14} />
                  Play App Treino
                </p>
                <h2>{greeting}</h2>
                <p className="student-play-lead">
                  Catálogo para o treino, com player completo e fila contínua.
                </p>
                {featuredAlbum && (
                  <div className="student-play-hero-actions">
                    <button className="student-play-cta" onClick={() => playAlbum(featuredAlbum)} type="button">
                      <Play size={18} fill="currentColor" />
                      Ouvir agora
                    </button>
                    <button className="student-play-ghost" onClick={() => playTracks(allTracks, 0, true)} type="button">
                      <Shuffle size={16} />
                      Mix aleatório
                    </button>
                  </div>
                )}
              </div>
              <button
                className="student-play-hero-art"
                onClick={() => featuredAlbum && playAlbum(featuredAlbum)}
                type="button"
                aria-label={featuredAlbum ? `Tocar ${featuredAlbum.title}` : "Play"}
              >
                <div className="student-play-hero-art-cover" style={coverStyle(featuredCover)} />
                <span className="student-play-hero-art-glow" aria-hidden />
                <span className="student-play-hero-play">
                  <Play size={28} fill="currentColor" />
                </span>
              </button>
            </header>

            <label className="student-play-search">
              <Search size={16} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar álbum, faixa ou artista"
                type="search"
                value={query}
              />
            </label>

            {error && <p className="student-play-error">{error}</p>}
            {loading && <p className="student-play-empty">Carregando sua trilha...</p>}

            {likedTracks.length > 0 && !normalizedQuery && (
              <section className="student-play-block">
                <div className="student-play-block-head">
                  <h3>Favoritas</h3>
                  <span>{likedTracks.length}</span>
                </div>
                <div className="student-play-tracks">
                  {likedTracks.slice(0, 6).map((track) => (
                    <button
                      className={`student-play-track${current?.id === track.id ? " is-active" : ""}`}
                      key={`liked-${track.id}`}
                      onClick={() => playTracks(likedTracks, likedTracks.findIndex((item) => item.id === track.id))}
                      type="button"
                    >
                      <span className="student-play-track-index">
                        <Heart size={14} fill="currentColor" />
                      </span>
                      <div className="student-play-track-cover" style={coverStyle(track.coverUrl)} />
                      <span className="student-play-track-meta">
                        <strong>{track.title}</strong>
                        <small>{track.artist || "App Treino"}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="student-play-block">
              <div className="student-play-block-head">
                <h3>Álbuns</h3>
                <span>Toque para abrir</span>
              </div>
              <div className="student-play-albums">
                {filteredAlbums.map((album) => {
                  const isActive = current?.albumId === album.id;
                  return (
                    <article className={`student-play-album${isActive ? " is-active" : ""}`} key={album.id}>
                      <div className="student-play-album-hit">
                        <div className="student-play-album-cover-wrap">
                          <button
                            className="student-play-album-cover"
                            onClick={() => setOpenAlbumId(album.id)}
                            style={coverStyle(album.coverUrl)}
                            type="button"
                            aria-label={`Abrir ${album.title}`}
                          >
                            {!album.coverUrl && <Disc3 size={36} />}
                          </button>
                          <button
                            aria-label={`Tocar ${album.title}`}
                            className="student-play-album-overlay"
                            onClick={() => playAlbum(album)}
                            type="button"
                          >
                            <Play size={26} fill="currentColor" />
                          </button>
                        </div>
                        <button className="student-play-album-copy" onClick={() => setOpenAlbumId(album.id)} type="button">
                          <strong>{album.title}</strong>
                          <span>{album.tracks.length} faixas</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
                {!loading && !filteredAlbums.length && <p className="student-play-empty">Nenhum álbum encontrado.</p>}
              </div>
            </section>

            <section className="student-play-block">
              <div className="student-play-block-head">
                <h3>Faixas</h3>
                <span>{filteredTracks.length} disponíveis</span>
              </div>
              <div className="student-play-tracks">
                {filteredTracks.map((track, trackIndex) => {
                  const active = current?.id === track.id;
                  const liked = likedIds.includes(track.id);
                  return (
                    <div
                      className={`student-play-track${active ? " is-active" : ""}${active && playing ? " is-playing" : ""}`}
                      key={track.id}
                    >
                      <button className="student-play-track-main" onClick={() => playTracks(filteredTracks, trackIndex)} type="button">
                        <span className="student-play-track-index">
                          {active && playing ? <span className="student-play-eq" aria-hidden /> : trackIndex + 1}
                        </span>
                        <div className="student-play-track-cover" style={coverStyle(track.coverUrl)}>
                          {!track.coverUrl && <Music2 size={16} />}
                        </div>
                        <span className="student-play-track-meta">
                          <strong>{track.title}</strong>
                          <small>{track.artist || "App Treino"}</small>
                        </span>
                        <span className="student-play-track-duration">
                          {track.durationSec != null ? formatClock(track.durationSec) : "—"}
                        </span>
                        <span className="student-play-track-action" aria-hidden>
                          {active && playing ? <Pause size={16} /> : <Play size={16} />}
                        </span>
                      </button>
                      <button
                        aria-label={liked ? "Remover dos favoritos" : "Favoritar"}
                        className={`student-play-like${liked ? " is-on" : ""}`}
                        onClick={() => toggleLike(track.id)}
                        type="button"
                      >
                        <Heart size={16} fill={liked ? "currentColor" : "none"} />
                      </button>
                    </div>
                  );
                })}
                {!loading && !filteredTracks.length && <p className="student-play-empty">Nenhuma música encontrada.</p>}
              </div>
            </section>
          </>
        )}
      </div>

      {current && !expanded && (
        <button className={`student-play-now${playing ? " is-playing" : ""}`} onClick={() => expand()} type="button">
          <div className="student-play-now-cover" style={coverStyle(current.coverUrl)} />
          <div className="student-play-now-meta">
            <strong>{current.title}</strong>
            <span>{current.artist || "App Treino"}</span>
          </div>
          <span className="student-play-now-hint">Player</span>
        </button>
      )}
    </section>
  );
}
