import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { useSession } from "@/hooks/useSession";

type FarmRow = Database["public"]["Tables"]["farms"]["Row"];

function farmListLabel(f: FarmRow): string {
  const n = f.name?.trim();
  if (n) return n;
  return `Granja ${f.id.slice(0, 8)}…`;
}

export function HomePage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const uid = session?.user.id ?? null;
  const [farms, setFarms] = useState<FarmRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

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

  function startRename(f: FarmRow) {
    setEditingId(f.id);
    setEditDraft(f.name?.trim() ?? "");
  }

  function cancelRename() {
    setEditingId(null);
    setEditDraft("");
  }

  async function saveRename(farmId: string) {
    if (!supabaseConfigured) return;
    setSavingName(true);
    setError(null);
    const { error: e } = await supabase.rpc("set_farm_name", {
      p_farm_id: farmId,
      p_name: editDraft,
    });
    setSavingName(false);
    if (e) {
      setError(e.message);
      return;
    }
    setEditingId(null);
    setEditDraft("");
    await load();
  }

  async function removeFarm(f: FarmRow) {
    if (!supabaseConfigured || !uid) return;
    const isOwner = f.created_by === uid;
    const msg = isOwner
      ? "¿Eliminar esta granja para todos? Se borrará el progreso compartido."
      : "¿Salir de esta granja? Podrás volver si te invitan de nuevo.";
    if (!window.confirm(msg)) return;
    setRemovingId(f.id);
    setError(null);
    const { error: e } = await supabase.rpc(
      isOwner ? "delete_farm" : "leave_farm",
      { p_farm_id: f.id },
    );
    setRemovingId(null);
    if (e) {
      if (e.message.includes("creator_must_delete")) {
        setError("Como creador de la granja, usa «Eliminar» para borrarla.");
      } else {
        setError(e.message);
      }
      return;
    }
    await load();
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
          className="tf-btn-soft px-3 py-1.5 text-xs"
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
            <div className="tf-panel flex flex-col gap-3 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                {editingId === f.id ? (
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      value={editDraft}
                      onChange={(ev) => setEditDraft(ev.target.value)}
                      maxLength={60}
                      placeholder="Nombre de la granja"
                      className="w-full min-w-0 rounded-xl border-2 border-ui-border/70 bg-white/95 px-3 py-2 font-display text-base font-bold text-ui-ink outline-none focus:border-pastel-sky/80 focus:ring-2 focus:ring-pastel-sky/30"
                      autoFocus
                    />
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={savingName}
                        onClick={() => void saveRename(f.id)}
                        className="tf-btn-soft border-pastel-mint/50 bg-pastel-mint/30 px-3 py-1.5 text-xs hover:border-pastel-mint/70 hover:bg-pastel-mint/45"
                      >
                        {savingName ? "Guardando…" : "Guardar"}
                      </button>
                      <button
                        type="button"
                        disabled={savingName}
                        onClick={cancelRename}
                        className="tf-btn-soft px-3 py-1.5 text-xs"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <Link
                    to={`/farm/${f.id}`}
                    className="min-w-0 break-words font-display text-lg font-bold text-pastel-sky hover:text-ui-ink"
                  >
                    {farmListLabel(f)}
                  </Link>
                )}
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span className="text-sm font-medium text-ui-ink/70">
                    v{f.version} · 🌽 {f.corn_count} 🥔 {f.potato_count}
                  </span>
                  {editingId !== f.id && uid && (
                    <>
                      <button
                        type="button"
                        onClick={() => startRename(f)}
                        className="tf-btn-soft px-3 py-1.5 text-xs"
                      >
                        Renombrar
                      </button>
                      <button
                        type="button"
                        disabled={removingId === f.id}
                        onClick={() => void removeFarm(f)}
                        className="tf-btn-soft border-red-200/55 bg-red-50/50 px-3 py-1.5 text-xs font-bold text-red-900/90 hover:border-red-300/70 hover:bg-red-50/80"
                      >
                        {removingId === f.id
                          ? "…"
                          : f.created_by === uid
                            ? "Eliminar"
                            : "Salir"}
                      </button>
                    </>
                  )}
                </div>
              </div>
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
