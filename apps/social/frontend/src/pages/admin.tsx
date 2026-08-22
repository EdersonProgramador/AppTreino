import { useEffect, useState } from "react";
import Head from "next/head";
import { toast } from "react-toastify";
import { api } from "@/lib";
import { useAuth } from "@/hooks";
import Router from "next/router";

interface ReportRow {
  id: number;
  target_type: string;
  reason: string;
  status: string;
  target_user_id: string | null;
  post: { id: number; content: string; hidden: boolean } | null;
  reporter: { username: string };
}

export default function AdminReports() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ReportRow[]>([]);

  async function load() {
    try {
      const { data } = await api().get("/admin/reports");
      if (data?.success) {
        setRows(data.reports);
      }
    } catch {
      toast.warning("Acesso restrito à moderação.");
      Router.push("/");
    }
  }

  useEffect(() => {
    if (user && user.role !== "admin") {
      Router.push("/");
      return;
    }
    load();
  }, [user]);

  async function act(id: number, action: "dismiss" | "hide_post" | "suspend_user") {
    try {
      const { data } = await api().post(`/admin/reports/${id}`, { action });
      if (data?.success) {
        toast.success("Ação registrada.");
        load();
      }
    } catch (error) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.warning(err.response?.data?.message || "Não foi possível moderar.");
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl rounded-3xl bg-white p-6 shadow-soft">
      <Head><title>Moderação</title></Head>
      <h1 className="text-2xl font-medium text-ink">Denúncias</h1>
      <p className="mt-1 text-sm text-slate-500">Oculte publicação, suspenda conta ou arquive o pedido.</p>
      <div className="mt-6 space-y-3">
        {rows.map(row => (
          <div key={row.id} className="rounded-2xl border border-slate-100 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">{row.target_type} · {row.status}</div>
            <p className="mt-1 text-sm text-ink">{row.reason}</p>
            {row.post ? <p className="mt-2 text-sm text-slate-500">{row.post.content}</p> : null}
            <p className="mt-2 text-xs text-slate-400">por {row.reporter.username}</p>
            {row.status === "pending" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="rounded-lg border-0 bg-slate-100 px-3 py-2 text-xs" onClick={() => act(row.id, "dismiss")}>Arquivar</button>
                {row.post ? <button type="button" className="rounded-lg border-0 bg-amber-100 px-3 py-2 text-xs" onClick={() => act(row.id, "hide_post")}>Ocultar post</button> : null}
                <button type="button" className="rounded-lg border-0 bg-red-100 px-3 py-2 text-xs text-red-700" onClick={() => act(row.id, "suspend_user")}>Suspender conta</button>
              </div>
            ) : null}
          </div>
        ))}
        {rows.length === 0 ? <p className="text-sm text-slate-500">Nenhuma denúncia.</p> : null}
      </div>
    </main>
  );
}
