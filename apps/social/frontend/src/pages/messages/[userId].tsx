import { FormEvent, useEffect, useRef, useState } from "react";
import Head from "next/head";
import Link from "@/lib/legacy-link";
import { useRouter } from "next/router";
import { toast } from "react-toastify";
import { api } from "@/lib";
import { useAuth } from "@/hooks";
import { useSocket } from "@/hooks";

interface ThreadMessage {
  id: number;
  content: string;
  sender_id: string;
  created_on: string;
}

export default function DirectThread() {
  const router = useRouter();
  const userId = typeof router.query.userId === "string" ? router.query.userId : "";
  const { user } = useAuth();
  const { emitTyping } = useSocket();
  const [other, setOther] = useState<{ id: string; username: string; image_url: string } | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const lastTypingAt = useRef(0);

  useEffect(() => {
    if (!userId) {
      return;
    }

    (async () => {
      try {
        const { data } = await api().get(`/messages/${userId}`);
        if (data?.success) {
          setOther(data.user);
          setMessages(data.messages);
        }
      } catch {
        toast.warning("Não foi possível abrir a conversa.");
      }
    })();
  }, [userId]);

  useEffect(() => {
    function onTyping(event: Event) {
      const fromUserId = (event as CustomEvent<{ fromUserId: string }>).detail?.fromUserId;
      if (fromUserId === userId) {
        setTyping(true);
        window.setTimeout(() => setTyping(false), 1500);
      }
    }
    window.addEventListener("dm-typing", onTyping);
    return () => window.removeEventListener("dm-typing", onTyping);
  }, [userId]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!content.trim() || loading) {
      return;
    }

    setLoading(true);
    try {
      const { data } = await api().post(`/messages/${userId}`, { content });
      if (data?.success) {
        setMessages(current => [...current, data.message]);
        setContent("");
      }
    } catch (error) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.warning(err.response?.data?.message || "Não foi possível enviar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-2xl flex-col rounded-3xl bg-white p-6 shadow-soft">
      <Head><title>{other?.username || "Mensagem"}</title></Head>
      <header className="mb-4 flex items-center gap-3 border-b border-slate-100 pb-4">
        <Link href="/messages"><a className="text-sm text-brand">Voltar</a></Link>
        {other ? (
          <Link href={`/profile/${other.id}`}>
            <a className="flex items-center gap-2 font-medium text-ink">
              <img src={other.image_url} alt="" className="h-10 w-10 rounded-full object-cover" />
              {other.username}
            </a>
          </Link>
        ) : null}
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto">
        {messages.map(item => (
          <div
            key={item.id}
            className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${item.sender_id === user?.id ? "ml-auto bg-brand text-white" : "bg-mist text-ink"}`}
          >
            {item.content}
          </div>
        ))}
      </div>

      {typing ? <p className="mt-2 text-xs text-slate-400">digitando...</p> : null}
      <form onSubmit={send} className="mt-4 flex gap-2">
        <input
          className="form-input mt-0"
          placeholder="Escreva uma mensagem"
          value={content}
          onChange={({ target }) => {
            setContent(target.value);
            const now = Date.now();
            if (userId && now - lastTypingAt.current > 800) {
              lastTypingAt.current = now;
              emitTyping(userId);
            }
          }}
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl border-0 bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </main>
  );
}
