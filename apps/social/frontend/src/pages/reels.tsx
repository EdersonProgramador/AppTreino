import { FormEvent, useEffect, useRef, useState } from "react";
import Head from "next/head";
import Link from "@/lib/legacy-link";
import { toast } from "react-toastify";
import { AiFillHeart, AiOutlineHeart } from "react-icons/ai";
import { MdOutlinePhotoCamera } from "react-icons/md";
import { api } from "@/lib";
import { useAuth } from "@/hooks";
import { moodLabel, MoodId } from "@/lib/moods";
import { MoodPicks } from "@/components/media/MoodPicks";
import { CameraCapture } from "@/components/media/CameraCapture";

interface ReelRow {
  id: number;
  video_url: string;
  caption: string;
  mood: string | null;
  username: string;
  image_url: string;
  cover_color: string;
  user_id: string;
  likes: number;
  liked: boolean;
}

export default function ReelsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ReelRow[]>([]);
  const [composer, setComposer] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [mood, setMood] = useState<MoodId>("vibe");
  const [saving, setSaving] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  async function load() {
    const { data } = await api().get("/reels");
    if (data?.success) {
      setRows(data.reels);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      return;
    }
    setSaving(true);
    try {
      const form = new FormData();
      form.append("video", file);
      form.append("body", JSON.stringify({ caption, mood }));
      const { data } = await api().post("/reels", form);
      if (data?.success) {
        toast.success("Clipe publicado.");
        setComposer(false);
        setFile(null);
        setCaption("");
        load();
      }
    } catch (error) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.warning(err.response?.data?.message || "Não foi possível enviar o vídeo.");
    } finally {
      setSaving(false);
    }
  }

  async function like(id: number) {
    const { data } = await api().post(`/reels/${id}/like`);
    if (data?.success) {
      setRows(current => current.map(row => row.id === id
        ? { ...row, liked: data.liked, likes: row.likes + (data.liked ? 1 : -1) }
        : row));
    }
  }

  return (
    <main className="relative mx-auto w-full max-w-md overflow-hidden rounded-3xl bg-ink text-white shadow-soft lg:w-[70%]">
      <Head><title>Clipes</title></Head>
      <header className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-4 py-3">
        <div>
          <h1 className="text-lg font-medium">Clipes</h1>
          <p className="text-[11px] text-white/70">Vídeo vertical, um clima por vez.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="rounded-full border-0 bg-white/15 px-3 py-1.5 text-xs font-medium" onClick={() => { setComposer(true); setCameraOpen(true); }}>
            Câmera
          </button>
          <button type="button" className="rounded-full border-0 bg-accent px-3 py-1.5 text-xs font-medium" onClick={() => setComposer(true)}>
            Novo clipe
          </button>
        </div>
      </header>

      <div ref={scroller} className="h-[calc(100dvh-7rem)] snap-y snap-mandatory overflow-y-auto">
        {rows.map(row => (
          <article key={row.id} className="relative flex h-full min-h-[calc(100dvh-7rem)] snap-start items-end">
            <video src={row.video_url} className="absolute inset-0 h-full w-full object-cover" loop muted playsInline autoPlay />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
            <div className="relative z-10 flex w-full items-end justify-between p-4">
              <div className="min-w-0 pr-3">
                <Link href={`/profile/${row.user_id}`}>
                  <a className="flex items-center gap-2 text-sm font-medium">
                    <img src={row.image_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                    {row.username}
                  </a>
                </Link>
                {row.mood ? <div className="mt-1 text-xs">{moodLabel(row.mood)?.emoji} {moodLabel(row.mood)?.label}</div> : null}
                {row.caption ? <p className="mt-2 text-sm text-white/90">{row.caption}</p> : null}
              </div>
              <button type="button" className="border-0 bg-transparent text-center text-white" onClick={() => like(row.id)}>
                {row.liked ? <AiFillHeart className="text-3xl text-red-400" /> : <AiOutlineHeart className="text-3xl" />}
                <div className="text-xs">{row.likes}</div>
              </button>
            </div>
            {row.user_id === user?.id ? (
              <button
                type="button"
                className="absolute right-4 top-16 z-10 rounded-full border-0 bg-black/40 px-3 py-1 text-xs"
                onClick={async () => {
                  await api().delete(`/reels/${row.id}`);
                  load();
                }}
              >
                Apagar
              </button>
            ) : null}
          </article>
        ))}
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-white/70">
            Ainda não há clipes. Publique o primeiro no clima de agora.
          </div>
        ) : null}
      </div>

      {composer ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4" onClick={() => setComposer(false)}>
          <form className="w-full max-w-md rounded-3xl bg-white p-5 text-ink shadow-soft" onClick={event => event.stopPropagation()} onSubmit={publish}>
            <h2 className="text-lg font-medium">Novo clipe</h2>
            <p className="mt-1 text-sm text-slate-500">Vídeo vertical (mp4 ou webm). Grave agora ou envie da galeria.</p>
            <div className="mt-4 flex gap-2">
              <input className="block min-w-0 flex-1 text-sm" type="file" accept="video/mp4,video/webm" onChange={({ target }) => setFile(target.files?.[0] || null)} />
              <button
                type="button"
                className="flex shrink-0 items-center gap-1 rounded-xl border-0 bg-mist px-3 py-2 text-sm"
                onClick={() => setCameraOpen(true)}
              >
                <MdOutlinePhotoCamera /> Câmera
              </button>
            </div>
            {file ? (
              <video src={URL.createObjectURL(file)} className="mt-3 max-h-64 w-full rounded-2xl bg-black object-contain" controls playsInline />
            ) : null}
            <input className="form-input mt-3" placeholder="Legenda" value={caption} onChange={({ target }) => setCaption(target.value)} />
            <div className="mt-3"><MoodPicks value={mood} onChange={setMood} /></div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-xl border-0 bg-mist px-4 py-2 text-sm" onClick={() => setComposer(false)}>Cancelar</button>
              <button type="submit" disabled={!file || saving} className="rounded-xl border-0 bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Publicar</button>
            </div>
          </form>
        </div>
      ) : null}
      <CameraCapture
        open={cameraOpen}
        kinds="video"
        maxVideoSeconds={60}
        title="Câmera do clipe"
        hint="Grave um vídeo vertical de até 60s"
        onClose={() => setCameraOpen(false)}
        onCapture={captured => {
          setFile(captured);
          setComposer(true);
          setCameraOpen(false);
        }}
      />
    </main>
  );
}
