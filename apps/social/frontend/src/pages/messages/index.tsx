import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "@/lib/legacy-link";
import { api } from "@/lib";

interface ConversationRow {
  id: string;
  user: { id: string; username: string; image_url: string };
  lastMessage: { content: string } | null;
}

export default function MessagesIndex() {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await api().get("/messages/conversations");
      if (data?.success) {
        setConversations(data.conversations);
      }
    })();
  }, []);

  return (
    <main className="mx-auto w-full max-w-2xl rounded-3xl bg-white p-6 shadow-soft">
      <Head><title>Mensagens</title></Head>
      <h1 className="text-2xl font-medium text-ink">Mensagens</h1>
      <p className="mt-1 text-sm text-slate-500">Conversas privadas com outras pessoas. O chat global continua em Chat.</p>

      <div className="mt-6 space-y-2">
        {conversations.map(row => (
          <Link key={row.id} href={`/messages/${row.user.id}`}>
            <a className="flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-mist">
              <img src={row.user.image_url} alt="" className="h-12 w-12 rounded-full object-cover" />
              <div className="min-w-0">
                <div className="font-medium text-ink">{row.user.username}</div>
                <div className="truncate text-sm text-slate-500">{row.lastMessage?.content || "Nenhuma mensagem ainda"}</div>
              </div>
            </a>
          </Link>
        ))}
        {conversations.length === 0 ? (
          <p className="rounded-2xl bg-mist p-4 text-sm text-slate-500">Nenhuma conversa ainda. Abra um perfil e toque em Mensagem.</p>
        ) : null}
      </div>
    </main>
  );
}
