import { FormEvent, useEffect, useState } from "react";
import Link from "@/lib/legacy-link";
import { toast } from "react-toastify";
import { MdOutlinePhotoCamera } from "react-icons/md";
import { api } from "@/lib";
import { useAuth } from "@/hooks";
import { moodLabel, MoodId } from "@/lib/moods";
import { MoodPicks } from "./MoodPicks";
import { CameraCapture } from "./CameraCapture";
import { StoryViewer, StoryRailGroup } from "./StoryViewer";

export function StoryRail() {
  const { user } = useAuth();
  const [rails, setRails] = useState<StoryRailGroup[]>([]);
  const [composer, setComposer] = useState(false);
  const [viewer, setViewer] = useState<{ rail: number; item: number } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [mood, setMood] = useState<MoodId>("vibe");
  const [saving, setSaving] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  async function load() {
    const { data } = await api().get("/stories");
    if (data?.success) {
      setRails(data.rails);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!file || saving) {
      return;
    }
    setSaving(true);
    try {
      const form = new FormData();
      form.append("media", file);
      form.append("body", JSON.stringify({ caption, mood }));
      const { data } = await api().post("/stories", form);
      if (data?.success) {
        toast.success("Momento no ar por 24h.");
        setComposer(false);
        setFile(null);
        setCaption("");
        load();
      }
    } catch (error) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.warning(err.response?.data?.message || "Não foi possível publicar.");
    } finally {
      setSaving(false);
    }
  }

  const mine = rails.find(item => item.isMine);

  return (
    <section className="mb-4 rounded-3xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-ink">Momentos</h2>
          <p className="text-xs text-slate-500">24 horas, com o clima do seu dia.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/reels"><a className="text-xs font-medium text-brand">Clipes</a></Link>
          <Link href="/live"><a className="text-xs font-medium text-accent">Ao vivo</a></Link>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1">
        <button type="button" className="w-20 shrink-0 border-0 bg-transparent p-0 text-center" onClick={() => setComposer(true)}>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-mist text-2xl text-brand ring-2 ring-brand/30">
            +
          </div>
          <div className="mt-1 truncate text-[11px] text-ink">Seu momento</div>
        </button>
        <button type="button" className="w-20 shrink-0 border-0 bg-transparent p-0 text-center" onClick={() => { setComposer(true); setCameraOpen(true); }}>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-ink text-xl text-white ring-2 ring-brand/30">
            <MdOutlinePhotoCamera />
          </div>
          <div className="mt-1 truncate text-[11px] text-ink">Câmera</div>
        </button>

        {rails.map((rail, railIndex) => (
          <button
            key={rail.userId}
            type="button"
            className="w-20 shrink-0 border-0 bg-transparent p-0 text-center"
            onClick={() => setViewer({ rail: railIndex, item: 0 })}
          >
            <div
              className="mx-auto h-16 w-16 rounded-full p-[2px]"
              style={{ background: rail.unseen || rail.isMine ? `conic-gradient(${rail.cover_color}, #f97316, ${rail.cover_color})` : "#cbd5e1" }}
            >
              <img src={rail.image_url} alt="" className="h-full w-full rounded-full object-cover ring-2 ring-white" />
            </div>
            <div className="mt-1 truncate text-[11px] text-ink">{rail.isMine ? "Você" : rail.username.split(" ")[0]}</div>
          </button>
        ))}
      </div>

      {mine ? (
        <p className="mt-2 text-[11px] text-slate-400">{mine.items.length} momento{mine.items.length > 1 ? "s" : ""} seu{mine.items.length > 1 ? "s" : ""} no ar</p>
      ) : null}

      {composer ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" onClick={() => setComposer(false)}>
          <form className="w-full max-w-md rounded-3xl bg-white p-5 shadow-soft" onClick={event => event.stopPropagation()} onSubmit={publish}>
            <h3 className="text-lg font-medium text-ink">Novo momento</h3>
            <p className="mt-1 text-sm text-slate-500">Foto ou vídeo curto. Some em 24 horas.</p>
            <div className="mt-4 flex gap-2">
              <input
                className="block min-w-0 flex-1 text-sm"
                type="file"
                accept="image/*,video/mp4,video/webm"
                onChange={({ target }) => setFile(target.files?.[0] || null)}
              />
              <button
                type="button"
                className="flex shrink-0 items-center gap-1 rounded-xl border-0 bg-mist px-3 py-2 text-sm"
                onClick={() => setCameraOpen(true)}
              >
                <MdOutlinePhotoCamera /> Câmera
              </button>
            </div>
            {file ? (
              <div className="mt-3 overflow-hidden rounded-2xl bg-black">
                {file.type.startsWith("video/") ? (
                  <video src={URL.createObjectURL(file)} className="max-h-48 w-full object-contain" muted playsInline controls />
                ) : (
                  <img src={URL.createObjectURL(file)} alt="" className="max-h-48 w-full object-contain" />
                )}
              </div>
            ) : null}
            <input
              className="form-input mt-3"
              placeholder="Uma linha, se quiser"
              value={caption}
              maxLength={120}
              onChange={({ target }) => setCaption(target.value)}
            />
            <div className="mt-3">
              <MoodPicks value={mood} onChange={setMood} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-xl border-0 bg-mist px-4 py-2 text-sm" onClick={() => setComposer(false)}>Cancelar</button>
              <button type="submit" disabled={!file || saving} className="rounded-xl border-0 bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Publicar</button>
            </div>
          </form>
        </div>
      ) : null}

      <CameraCapture
        open={cameraOpen}
        kinds="any"
        maxVideoSeconds={15}
        title="Câmera do momento"
        hint="Foto ou vídeo curto, some em 24h"
        onClose={() => setCameraOpen(false)}
        onCapture={captured => {
          setFile(captured);
          setComposer(true);
          setCameraOpen(false);
        }}
      />

      {viewer ? (
        <StoryViewer
          rails={rails}
          startRail={viewer.rail}
          startItem={viewer.item}
          currentUserId={user?.id || ""}
          onClose={() => {
            setViewer(null);
            load();
          }}
        />
      ) : null}

      <LivePills />
    </section>
  );
}

function LivePills() {
  const [lives, setLives] = useState<{ id: string; title: string; username: string; cover_color: string; mood?: string }[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await api().get("/live");
      if (data?.success) {
        setLives(data.lives);
      }
    })();
  }, []);

  if (!lives.length) {
    return null;
  }

  return (
    <div className="mt-4 flex gap-2 overflow-x-auto">
      {lives.map(item => (
        <Link key={item.id} href={`/live/${item.id}`}>
          <a className="flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-white" style={{ background: item.cover_color }}>
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
            Ao vivo · {item.username.split(" ")[0]}
            {moodLabel(item.mood) ? ` ${moodLabel(item.mood)?.emoji}` : ""}
          </a>
        </Link>
      ))}
    </div>
  );
}
