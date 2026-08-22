import { FormEvent, useEffect, useRef, useState } from "react";
import Head from "next/head";
import Link from "@/lib/legacy-link";
import Router from "next/router";
import { toast } from "react-toastify";
import { MdOutlineCameraswitch, MdOutlinePhotoCamera } from "react-icons/md";
import { api } from "@/lib";
import { moodLabel, MoodId } from "@/lib/moods";
import { MoodPicks } from "@/components/media/MoodPicks";

interface LiveRow {
  id: string;
  title: string;
  mood: string | null;
  username: string;
  image_url: string;
  cover_color: string;
  isMine: boolean;
}

export default function LiveLobby() {
  const [rows, setRows] = useState<LiveRow[]>([]);
  const [title, setTitle] = useState("");
  const [mood, setMood] = useState<MoodId>("vibe");
  const [saving, setSaving] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  function stopPreview() {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (previewRef.current) {
      previewRef.current.srcObject = null;
    }
  }

  async function load() {
    const { data } = await api().get("/live");
    if (data?.success) {
      setRows(data.lives);
    }
  }

  useEffect(() => {
    load();
    return () => stopPreview();
  }, []);

  useEffect(() => {
    if (!cameraOn) {
      stopPreview();
      return;
    }

    let cancelled = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.warning("Câmera indisponível neste navegador.");
        setCameraOn(false);
        return;
      }

      stopPreview();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        if (previewRef.current) {
          previewRef.current.srcObject = stream;
          await previewRef.current.play().catch(() => undefined);
        }
      } catch {
        if (!cancelled) {
          setCameraOn(false);
          toast.warning("Permita o acesso à câmera para entrar no ar.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cameraOn, facing]);

  async function start(event: FormEvent) {
    event.preventDefault();
    if (title.trim().length < 2) {
      return;
    }
    setSaving(true);
    try {
      const { data } = await api().post("/live", { title, mood });
      if (data?.success) {
        stopPreview();
        Router.push(`/live/${data.live.id}`);
      }
    } catch (error) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.warning(err.response?.data?.message || "Não foi possível iniciar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl rounded-3xl bg-white p-6 shadow-soft lg:w-[70%]">
      <Head><title>Ao vivo</title></Head>
      <h1 className="text-2xl font-medium text-ink">Ao vivo</h1>
      <p className="mt-1 text-sm text-slate-500">Abra a câmera, escolha um clima e converse com quem entrar. Sem palco genérico: o título é seu.</p>

      <div className="relative mt-6 overflow-hidden rounded-3xl bg-black">
        {cameraOn ? (
          <video
            ref={previewRef}
            className="aspect-[9/16] max-h-[28rem] w-full object-cover sm:aspect-video"
            style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}
            muted
            playsInline
            autoPlay
          />
        ) : (
          <div className="flex aspect-video max-h-[28rem] flex-col items-center justify-center gap-3 bg-ink text-white">
            <MdOutlinePhotoCamera className="text-4xl" />
            <p className="text-sm text-white/70">Abra a câmera antes de entrar no ar</p>
          </div>
        )}
        <div className="absolute bottom-3 left-3 right-3 flex justify-between">
          <button
            type="button"
            className="rounded-full border-0 bg-white/90 px-3 py-2 text-xs font-medium text-ink"
            onClick={() => setCameraOn(current => !current)}
          >
            {cameraOn ? "Fechar câmera" : "Abrir câmera"}
          </button>
          <button
            type="button"
            className="rounded-full border-0 bg-white/90 p-2 text-lg text-ink disabled:opacity-40"
            disabled={!cameraOn}
            onClick={() => setFacing(current => current === "user" ? "environment" : "user")}
            aria-label="Virar câmera"
          >
            <MdOutlineCameraswitch />
          </button>
        </div>
      </div>

      <form onSubmit={start} className="mt-4 rounded-2xl bg-mist p-4">
        <label className="form-label">Título da live</label>
        <input className="form-input" placeholder="Ex.: Café da tarde na janela" value={title} onChange={({ target }) => setTitle(target.value)} />
        <div className="mt-3"><MoodPicks value={mood} onChange={setMood} /></div>
        <button type="submit" disabled={saving} className="mt-4 rounded-xl border-0 bg-red-600 px-4 py-2 text-sm font-medium text-white">
          Entrar no ar
        </button>
      </form>

      <div className="mt-8 space-y-3">
        {rows.map(row => (
          <Link key={row.id} href={`/live/${row.id}`}>
            <a className="flex items-center gap-3 rounded-2xl bg-mist px-4 py-3">
              <img src={row.image_url} alt="" className="h-12 w-12 rounded-full object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium text-ink">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  {row.title}
                </div>
                <div className="text-xs text-slate-500">
                  {row.username} {moodLabel(row.mood) ? `· ${moodLabel(row.mood)?.emoji} ${moodLabel(row.mood)?.label}` : ""}
                </div>
              </div>
            </a>
          </Link>
        ))}
        {rows.length === 0 ? <p className="text-sm text-slate-500">Ninguém no ar agora. Abra o primeiro.</p> : null}
      </div>
    </main>
  );
}
