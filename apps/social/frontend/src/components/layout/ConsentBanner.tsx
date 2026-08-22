import { useEffect, useState } from "react";
import Link from "@/lib/legacy-link";

const STORAGE_KEY = "lgpd-consent";

export function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(window.localStorage.getItem(STORAGE_KEY) !== "1");
  }, []);

  if (!visible) {
    return null;
  }

  function accept() {
    window.localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[120] border-t border-slate-200 bg-white p-4 shadow-soft">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          Usamos dados essenciais de conta, publicações e cookies de sessão para operar o serviço, conforme a LGPD.{" "}
          <Link href="/legal/privacidade"><a className="text-brand underline">Privacidade</a></Link>
          {" e "}
          <Link href="/legal/termos"><a className="text-brand underline">Termos</a></Link>.
        </p>
        <button
          type="button"
          className="shrink-0 rounded-xl border-0 bg-brand px-4 py-2 text-sm font-medium text-white"
          onClick={accept}
        >
          Entendi
        </button>
      </div>
    </div>
  );
}
