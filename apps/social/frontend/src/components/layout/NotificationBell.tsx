import { useEffect, useState } from "react";
import Link from "@/lib/legacy-link";
import { IoNotificationsOutline } from "react-icons/io5";
import { api } from "@/lib";

interface NotificationRow {
  id: number;
  type: string;
  read: boolean;
  post_id: number | null;
  actor: { id: string; username: string; image_url: string };
}

function label(row: NotificationRow) {
  if (row.type === "like") {
    return "curtiu sua publicação";
  }
  if (row.type === "comment") {
    return "comentou em sua publicação";
  }
  if (row.type === "follow") {
    return "começou a seguir você";
  }
  if (row.type === "message") {
    return "enviou uma mensagem";
  }
  if (row.type === "mention") {
    return "mencionou você";
  }
  if (row.type === "follow_request") {
    return "quer te seguir";
  }
  return "fez uma atividade";
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);

  async function load() {
    const { data } = await api().get("/notifications");
    if (data?.success) {
      setRows(data.notifications);
    }
  }

  useEffect(() => {
    load();
    function onNotify(event: Event) {
      const detail = (event as CustomEvent<NotificationRow>).detail;
      setRows(current => [detail, ...current.filter(item => item.id !== detail.id)]);
    }
    window.addEventListener("app-notification", onNotify);
    return () => window.removeEventListener("app-notification", onNotify);
  }, []);

  const unread = rows.filter(row => !row.read).length;

  async function markRead() {
    setOpen(!open);
    if (!open && unread) {
      await api().post("/notifications/read");
      setRows(current => current.map(row => ({ ...row, read: true })));
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600"
        onClick={markRead}
        aria-label="Notificações"
      >
        <IoNotificationsOutline />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500" />
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-30 w-80 rounded-xl border border-slate-100 bg-white p-2 shadow-soft">
          <div className="px-3 py-2 text-sm font-medium text-ink">Notificações</div>
          <div className="max-h-80 overflow-y-auto">
            {rows.map(row => {
              const href = row.type === "follow" || row.type === "mention"
                ? `/profile/${row.actor.id}`
                : row.type === "follow_request"
                  ? "/requests"
                  : row.type === "message"
                    ? `/messages/${row.actor.id}`
                    : "/";
              return (
                <Link key={row.id} href={href}>
                  <a className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-slate-50" onClick={() => setOpen(false)}>
                    <img src={row.actor.image_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                    <span><strong>{row.actor.username}</strong> {label(row)}</span>
                  </a>
                </Link>
              );
            })}
            {rows.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-500">Nenhuma notificação ainda.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
