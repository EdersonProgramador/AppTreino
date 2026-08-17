import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Disc3, Music2, Send, Trash2, Upload } from "lucide-react";
import { ApiError, apiDelete, apiGet, apiPost, apiPut, apiUpload } from "../../api";
import { mediaUrl } from "../../lib/urls";

type UploadResponse = { file: { url: string } };

type MusicTrack = {
  id: string;
  title: string;
  artist: string | null;
  audioUrl: string;
  coverUrl: string | null;
  durationSec: number | null;
  sortOrder: number;
  status: "DRAFT" | "PUBLISHED";
  albumId: string | null;
  album?: { id: string; title: string } | null;
};

type MusicAlbum = {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  status: "DRAFT" | "PUBLISHED";
  publishedAt: string | null;
  tracks: MusicTrack[];
};

type Props = {
  token: string;
};

export function MusicAdminPanel({ token }: Props) {
  const [albums, setAlbums] = useState<MusicAlbum[]>([]);
  const [singles, setSingles] = useState<MusicTrack[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [albumCoverPreview, setAlbumCoverPreview] = useState<string | null>(null);
  const albumCoverInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [albumRes, trackRes] = await Promise.all([
      apiGet<{ albums: MusicAlbum[] }>("/admin/cms/music/albums", token),
      apiGet<{ tracks: MusicTrack[] }>("/admin/cms/music/tracks", token)
    ]);
    setAlbums(albumRes.albums);
    setSingles(trackRes.tracks.filter((track) => !track.albumId));
  }, [token]);

  useEffect(() => {
    void load().catch(() => setFeedback("Nao foi possivel carregar o catalogo de musica."));
  }, [load]);

  async function uploadAudio(file: File) {
    const data = new FormData();
    const filename = file.name?.trim() || "track.mp3";
    data.append("file", file, filename);
    const response = await apiUpload<UploadResponse>("/admin/uploads?group=audio", data, token);
    return response.file.url;
  }

  async function uploadImage(file: File) {
    const data = new FormData();
    data.append("file", file);
    const response = await apiUpload<UploadResponse>("/admin/uploads?group=images", data, token);
    return response.file.url;
  }

  function handleAlbumCoverChange(file: File | null) {
    if (!file) {
      setAlbumCoverPreview(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAlbumCoverPreview(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  function clearAlbumCoverPreview() {
    setAlbumCoverPreview(null);
    if (albumCoverInputRef.current) {
      albumCoverInputRef.current.value = "";
    }
  }

  async function handleCreateAlbum(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const form = event.currentTarget;
      const data = new FormData(form);
      const coverFile = data.get("cover") as File | null;
      const coverUrl = coverFile && coverFile.size > 0 ? await uploadImage(coverFile) : null;
      await apiPost(
        "/admin/cms/music/albums",
        {
          title: String(data.get("title") || ""),
          description: String(data.get("description") || "") || null,
          coverUrl,
          status: data.get("publishNow") ? "PUBLISHED" : "DRAFT"
        },
        token
      );
      form.reset();
      clearAlbumCoverPreview();
      await load();
      setFeedback("Album salvo.");
    } catch {
      setFeedback("Falha ao salvar album.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateTrack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const form = event.currentTarget;
      const data = new FormData(form);
      const audioFile = data.get("audio") as File | null;
      if (!audioFile || !audioFile.size) {
        setFeedback("Selecione um arquivo de audio.");
        return;
      }
      const audioUrl = await uploadAudio(audioFile);
      const coverFile = data.get("cover") as File | null;
      const coverUrl = coverFile && coverFile.size > 0 ? await uploadImage(coverFile) : null;
      const albumId = String(data.get("albumId") || "") || null;
      await apiPost(
        "/admin/cms/music/tracks",
        {
          title: String(data.get("title") || ""),
          artist: String(data.get("artist") || "") || null,
          audioUrl,
          coverUrl,
          albumId,
          sortOrder: Number(data.get("sortOrder") || 0),
          status: data.get("publishNow") ? "PUBLISHED" : "DRAFT"
        },
        token
      );
      form.reset();
      await load();
      setFeedback("Faixa salva.");
    } catch (error) {
      setFeedback(error instanceof ApiError ? error.message : "Falha ao salvar faixa.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAlbum(album: MusicAlbum) {
    const next = album.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    await apiPut(`/admin/cms/music/albums/${album.id}`, { status: next }, token);
    await load();
  }

  async function toggleTrack(track: MusicTrack) {
    const next = track.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    await apiPut(`/admin/cms/music/tracks/${track.id}`, { status: next }, token);
    await load();
  }

  async function removeAlbum(id: string) {
    if (!confirm("Remover este album e suas faixas?")) return;
    await apiDelete(`/admin/cms/music/albums/${id}`, token);
    await load();
  }

  async function removeTrack(id: string) {
    if (!confirm("Remover esta faixa?")) return;
    await apiDelete(`/admin/cms/music/tracks/${id}`, token);
    await load();
  }

  return (
    <section className="admin-grid music-admin-panel" id="admin-music">
      <article className="panel-card">
        <div className="panel-title">
          <div>
            <h2>Play — Albuns</h2>
            <p>Publique albums para o catalogo do aluno. Ao publicar, todos recebem notificacao.</p>
          </div>
          <Disc3 size={22} />
        </div>
        <form className="crud-form" onSubmit={(event) => void handleCreateAlbum(event)}>
          <label>
            Titulo
            <input name="title" required placeholder="Ex.: Treino HIIT Mix" />
          </label>
          <label className="wide-field">
            Descricao
            <textarea name="description" placeholder="Opcional" />
          </label>
          <label>
            Capa
            <input
              accept="image/*"
              name="cover"
              type="file"
              ref={albumCoverInputRef}
              onChange={(event) => handleAlbumCoverChange(event.target.files?.[0] ?? null)}
            />
          </label>
          {albumCoverPreview ? (
            <div className="cms-image-preview wide-field">
              <img src={albumCoverPreview} alt="Previa da capa do album" />
              <button type="button" className="delete-action-button" onClick={clearAlbumCoverPreview}>
                <Trash2 size={17} />
                Remover imagem
              </button>
            </div>
          ) : null}
          <label className="cms-publish-check">
            <input defaultChecked name="publishNow" type="checkbox" />
            Publicar agora
          </label>
          <button className="primary-button" disabled={busy} type="submit">
            <Send size={18} />
            Salvar album
          </button>
        </form>
        <div className="music-admin-list">
          {albums.map((album) => (
            <div className={`data-row${album.coverUrl ? " with-thumb" : ""}`} key={album.id}>
              {album.coverUrl ? (
                <img className="cms-data-row-thumb" src={mediaUrl(album.coverUrl)} alt={album.title} />
              ) : null}
              <span>
                <strong>{album.title}</strong>
                {album.description}
                <small>
                  {album.tracks.length} faixa(s) · {album.status === "PUBLISHED" ? "Publicado" : "Rascunho"}
                </small>
              </span>
              <button aria-label="Alternar publicacao" onClick={() => void toggleAlbum(album)} type="button">
                <Send size={17} />
              </button>
              <button aria-label="Remover album" onClick={() => void removeAlbum(album.id)} type="button">
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
      </article>

      <article className="panel-card">
        <div className="panel-title">
          <div>
            <h2>Play — Faixas</h2>
            <p>Upload de audio (mp3/wav/ogg). Musica avulsa notifica “Nova musica disponivel”.</p>
          </div>
          <Music2 size={22} />
        </div>
        <form className="crud-form" onSubmit={(event) => void handleCreateTrack(event)}>
          <label>
            Titulo
            <input name="title" required placeholder="Nome da musica" />
          </label>
          <label>
            Artista
            <input name="artist" placeholder="Opcional" />
          </label>
          <label>
            Album (opcional)
            <select defaultValue="" name="albumId">
              <option value="">Musica avulsa</option>
              {albums.map((album) => (
                <option key={album.id} value={album.id}>
                  {album.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ordem
            <input defaultValue={0} min={0} name="sortOrder" type="number" />
          </label>
          <label className="wide-field">
            Arquivo de audio
            <input
              accept=".mp3,.wav,.ogg,.m4a,.aac,.flac,.opus,.webm,audio/*"
              name="audio"
              required
              type="file"
            />
            <small>MP3, WAV, OGG, M4A, AAC ou FLAC.</small>
          </label>
          <label>
            Capa (opcional)
            <input accept="image/*" name="cover" type="file" />
          </label>
          <label className="cms-publish-check">
            <input defaultChecked name="publishNow" type="checkbox" />
            Publicar agora
          </label>
          <button className="primary-button" disabled={busy} type="submit">
            <Upload size={18} />
            Salvar faixa
          </button>
        </form>
        <div className="music-admin-list">
          {singles.map((track) => (
            <div className="data-row" key={track.id}>
              <span>
                <strong>{track.title}</strong>
                {track.artist}
                <small>{track.status === "PUBLISHED" ? "Publicada" : "Rascunho"}</small>
              </span>
              <button aria-label="Alternar publicacao" onClick={() => void toggleTrack(track)} type="button">
                <Send size={17} />
              </button>
              <button aria-label="Remover faixa" onClick={() => void removeTrack(track.id)} type="button">
                <Trash2 size={17} />
              </button>
            </div>
          ))}
          {albums.flatMap((album) =>
            album.tracks.map((track) => (
              <div className="data-row" key={track.id}>
                <span>
                  <strong>{track.title}</strong>
                  <small>
                    Album: {album.title} · {track.status === "PUBLISHED" ? "Publicada" : "Rascunho"}
                  </small>
                </span>
                <button aria-label="Alternar publicacao" onClick={() => void toggleTrack(track)} type="button">
                  <Send size={17} />
                </button>
                <button aria-label="Remover faixa" onClick={() => void removeTrack(track.id)} type="button">
                  <Trash2 size={17} />
                </button>
              </div>
            ))
          )}
        </div>
      </article>
      {feedback && <p className="music-admin-feedback">{feedback}</p>}
    </section>
  );
}
