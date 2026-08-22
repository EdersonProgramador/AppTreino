import { useEffect, useRef, useState } from "react";
import { IoClose } from "react-icons/io5";
import { api } from "@/lib";
import { moodLabel } from "@/lib/moods";

export interface StoryItem {
  id: number;
  media_url: string;
  media_type: string;
  caption: string | null;
  mood: string | null;
  created_on: string;
  seen: boolean;
}

export interface StoryRailGroup {
  userId: string;
  username: string;
  image_url: string;
  cover_color: string;
  isMine: boolean;
  unseen: boolean;
  items: StoryItem[];
}

interface StoryViewerProps {
  rails: StoryRailGroup[];
  startRail: number;
  startItem: number;
  currentUserId: string;
  onClose: () => void;
}

export function StoryViewer({ rails, startRail, startItem, currentUserId, onClose }: StoryViewerProps) {
  const [railIndex, setRailIndex] = useState(startRail);
  const [itemIndex, setItemIndex] = useState(startItem);
  const timer = useRef<number | null>(null);
  const rail = rails[railIndex];
  const item = rail?.items[itemIndex];

  function clearTimer() {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function goNext() {
    if (!rail) {
      return;
    }
    if (itemIndex + 1 < rail.items.length) {
      setItemIndex(itemIndex + 1);
      return;
    }
    if (railIndex + 1 < rails.length) {
      setRailIndex(railIndex + 1);
      setItemIndex(0);
      return;
    }
    onClose();
  }

  function goPrev() {
    if (itemIndex > 0) {
      setItemIndex(itemIndex - 1);
      return;
    }
    if (railIndex > 0) {
      const previous = rails[railIndex - 1];
      setRailIndex(railIndex - 1);
      setItemIndex(Math.max(0, previous.items.length - 1));
    }
  }

  useEffect(() => {
    if (!item) {
      return;
    }
    api().post(`/stories/${item.id}/view`).catch(() => undefined);
    clearTimer();
    if (item.media_type !== "video") {
      timer.current = window.setTimeout(goNext, 5200);
    }
    return clearTimer;
  }, [railIndex, itemIndex]);

  if (!rail || !item) {
    return null;
  }

  const mood = moodLabel(item.mood);

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-ink">
      <button type="button" className="absolute right-4 top-4 z-10 border-0 bg-transparent text-2xl text-white" onClick={onClose} aria-label="Fechar">
        <IoClose />
      </button>
      <div className="relative h-full w-full max-w-md">
        <div className="absolute left-0 right-0 top-3 z-10 flex gap-1 px-3">
          {rail.items.map((entry, index) => (
            <div key={entry.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
              <div className={`h-full bg-white ${index < itemIndex ? "w-full" : index === itemIndex ? "w-full animate-pulse" : "w-0"}`} />
            </div>
          ))}
        </div>
        <div className="absolute left-3 top-8 z-10 flex items-center gap-2 text-sm text-white">
          <img src={rail.image_url} alt="" className="h-8 w-8 rounded-full object-cover" />
          <div>
            <div className="font-medium">{rail.username}</div>
            {mood ? <div className="text-xs text-white/80">{mood.emoji} {mood.label}</div> : null}
          </div>
        </div>
        {item.media_type === "video" ? (
          <video
            src={item.media_url}
            className="h-full w-full object-cover"
            autoPlay
            playsInline
            onEnded={goNext}
          />
        ) : (
          <img src={item.media_url} alt="" className="h-full w-full object-cover" />
        )}
        {item.caption ? (
          <div className="absolute bottom-16 left-4 right-4 rounded-2xl bg-black/45 px-4 py-3 text-sm text-white">{item.caption}</div>
        ) : null}
        <button type="button" className="absolute inset-y-0 left-0 w-1/3 border-0 bg-transparent" onClick={goPrev} aria-label="Anterior" />
        <button type="button" className="absolute inset-y-0 right-0 w-1/3 border-0 bg-transparent" onClick={goNext} aria-label="Próximo" />
        {rail.userId === currentUserId ? (
          <button
            type="button"
            className="absolute bottom-4 right-4 rounded-full border-0 bg-white/90 px-3 py-1 text-xs"
            onClick={async () => {
              await api().delete(`/stories/${item.id}`);
              onClose();
            }}
          >
            Apagar
          </button>
        ) : null}
      </div>
    </div>
  );
}
