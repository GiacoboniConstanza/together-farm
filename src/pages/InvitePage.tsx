import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase, supabaseConfigured } from "@/lib/supabase";

export function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !supabaseConfigured) {
      if (!supabaseConfigured) setMsg("Supabase no configurado");
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("accept_invite", {
        p_token: token,
      });
      if (cancelled) return;
      if (error) {
        setStatus("err");
        setMsg(error.message);
        return;
      }
      setStatus("ok");
      if (data) navigate(`/farm/${data}`, { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col justify-center px-4 py-12">
      <div className="tf-panel p-8 text-center">
        <h1 className="mb-4 font-display text-2xl font-bold text-ui-ink">
          Invitación
        </h1>
        {status === "idle" && (
          <p className="font-medium text-ui-ink/80">Uniéndote a la granja…</p>
        )}
        {status === "err" && (
          <p className="rounded-2xl border-2 border-red-400 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            {msg ?? "No se pudo aceptar"}
          </p>
        )}
        <p className="mt-8">
          <Link to="/" className="tf-link">
            Inicio
          </Link>
        </p>
      </div>
    </div>
  );
}
