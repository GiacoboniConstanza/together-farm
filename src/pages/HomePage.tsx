import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type FarmRow = Database["public"]["Tables"]["farms"]["Row"];

export function HomePage() {
  const navigate = useNavigate();
  const [farms, setFarms] = useState<FarmRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!supabaseConfigured) return;
    setError(null);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;

    const { data: mems, error: e1 } = await supabase
      .from("farm_members")
      .select("farm_id")
      .eq("user_id", uid);

    if (e1) {
      setError(e1.message);
      return;
    }

    const ids = (mems ?? []).map((m) => (m as { farm_id: string }).farm_id);
    if (ids.length === 0) {
      setFarms([]);
      return;
    }

    const { data: rows, error: e2 } = await supabase
      .from("farms")
      .select("*")
      .in("id", ids);

    if (e2) setError(e2.message);
    else setFarms(rows ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createFarm() {
    if (!supabaseConfigured) return;
    setCreating(true);
    setError(null);
    const { data, error: e } = await supabase.rpc("create_farm");
    setCreating(false);
    if (e) {
      setError(e.message);
      return;
    }
    if (data) navigate(`/farm/${data}`);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold text-ui-ink">
          Tus granjas
        </h1>
        <button
          type="button"
          onClick={() => void signOut()}
          className="tf-btn text-xs"
        >
          Salir
        </button>
      </header>

      {!supabaseConfigured && (
        <p className="mb-4 rounded-2xl border-2 border-red-400 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          Falta configuración Supabase (.env). Copia .env.example.
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-2xl border-2 border-red-400 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void createFarm()}
        disabled={creating || !supabaseConfigured}
        className="tf-btn-primary mb-6 w-full py-3 text-base sm:w-auto"
      >
        {creating ? "Creando…" : "Nueva granja compartida"}
      </button>

      <ul className="space-y-3">
        {farms.map((f) => (
          <li key={f.id}>
            <div className="tf-panel flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
              <Link
                to={`/farm/${f.id}`}
                className="font-display text-lg font-bold text-pastel-sky hover:text-ui-ink"
              >
                Granja {f.id.slice(0, 8)}…
              </Link>
              <span className="text-sm font-medium text-ui-ink/70">
                v{f.version} · 🌽 {f.corn_count} 🥔 {f.potato_count}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {farms.length === 0 && supabaseConfigured && (
        <p className="mt-4 rounded-2xl border-4 border-dashed border-ui-border/40 bg-pastel-cream/60 px-4 py-3 text-center text-sm font-medium text-ui-ink/75">
          Aún no tienes granjas. Crea una e invita a tu compañero con un
          enlace.
        </p>
      )}
    </div>
  );
}
