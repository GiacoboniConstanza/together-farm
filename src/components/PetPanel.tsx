import { useCallback, useEffect, useRef, useState } from "react";
import petSprite from "@/assets/pet-sprite.jpg";
import { PetRunnerGame } from "@/components/PetRunnerGame";
import { supabase, supabaseConfigured } from "@/lib/supabase";

type PetRow = {
  farm_id: string;
  name: string;
  hunger: number;
  cleanliness: number;
  energy: number;
  sleep_until: string | null;
  last_tick_at: string;
};

type Props = {
  farmId: string;
  cornCount: number;
  potatoCount: number;
  onInventoryChange: () => void;
};

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function Bar({
  label,
  value,
  barClass,
}: {
  label: string;
  value: number;
  barClass: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-xs font-bold text-ui-ink">
        <span>{label}</span>
        <span>{Math.round(v)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full border-2 border-ui-border bg-pastel-cream">
        <div
          className={`h-full rounded-full transition-[width] duration-200 ease-out ${barClass}`}
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}

export function PetPanel({
  farmId,
  cornCount,
  potatoCount,
  onInventoryChange,
}: Props) {
  const [pet, setPet] = useState<PetRow | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [gameOpen, setGameOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!supabaseConfigured) return;
    const { data, error } = await supabase
      .from("pets")
      .select("*")
      .eq("farm_id", farmId)
      .maybeSingle();
    if (error) setErr(error.message);
    else {
      setErr(null);
      const row = data ? (data as PetRow) : null;
      setPet(row);
      if (row) setNameDraft(row.name ?? "");
    }
  }, [farmId]);

  useEffect(() => {
    setEditingName(false);
    setGameOpen(false);
  }, [farmId]);

  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editingName]);

  useEffect(() => {
    void (async () => {
      await supabase.rpc("pet_tick", { p_farm_id: farmId });
      await refresh();
    })();
  }, [farmId, refresh]);

  async function run(label: string, fn: () => Promise<unknown>) {
    if (!supabaseConfigured) return;
    setBusy(label);
    setErr(null);
    const res = (await fn()) as { error: { message: string } | null };
    setBusy(null);
    if (res.error) setErr(res.error.message);
    else {
      await refresh();
      onInventoryChange();
    }
  }

  const sleeping =
    pet?.sleep_until &&
    new Date(pet.sleep_until).getTime() > Date.now();

  const displayName =
    pet?.name?.trim() ? pet.name.trim() : "Mascota";

  async function saveName() {
    if (!supabaseConfigured || !pet) return;
    const trimmed = nameDraft.trim();
    if (trimmed.length > 40) {
      setErr("El nombre puede tener como máximo 40 caracteres.");
      return;
    }
    setBusy("name");
    setErr(null);
    const { error } = await supabase
      .from("pets")
      .update({ name: trimmed })
      .eq("farm_id", farmId);
    setBusy(null);
    if (error) setErr(error.message);
    else {
      await refresh();
      setEditingName(false);
    }
  }

  function cancelNameEdit() {
    if (pet) setNameDraft(pet.name ?? "");
    setEditingName(false);
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        {pet && editingName ? (
          <>
            <input
              ref={nameInputRef}
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={40}
              placeholder="Mascota"
              disabled={busy !== null}
              className="min-w-0 flex-1 rounded-xl border-2 border-ui-border bg-white px-3 py-1 font-display text-2xl font-bold text-ui-ink outline-none placeholder:text-ui-ink/35 focus:border-pastel-mint disabled:opacity-60"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void saveName();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelNameEdit();
                }
              }}
            />
            <button
              type="button"
              disabled={busy !== null}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-ui-border/55 bg-pastel-mint/90 text-ui-ink hover:border-ui-border/85 hover:bg-pastel-mint disabled:opacity-50"
              aria-label="Guardar nombre"
              onClick={() => void saveName()}
            >
              {busy === "name" ? (
                <span className="text-lg leading-none">…</span>
              ) : (
                <CheckIcon />
              )}
            </button>
          </>
        ) : (
          <>
            <h2 className="mt-0 min-w-0 flex-1 truncate font-display text-2xl font-bold text-ui-ink">
              {displayName}
            </h2>
            {pet && (
              <button
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-ui-border/55 bg-pastel-cream/90 text-ui-ink hover:border-ui-border/85 hover:bg-pastel-cream"
                aria-label="Editar nombre"
                onClick={() => {
                  setNameDraft(pet.name ?? "");
                  setEditingName(true);
                }}
              >
                <PencilIcon />
              </button>
            )}
          </>
        )}
      </div>
      <p className="text-sm font-medium text-ui-ink/75">
        Alimenta con lo que cosechéis (🌽 {cornCount} · 🥔 {potatoCount}).
      </p>
      <div className="my-4 flex justify-center">
        <div className="inline-block rounded-2xl border-4 border-ui-border bg-black p-2 shadow-sticker-sm">
          <img
            src={petSprite}
            alt={displayName}
            className="tf-pixel-art mx-auto block h-auto max-h-44 w-auto max-w-full select-none"
            width={256}
            height={140}
            draggable={false}
          />
        </div>
      </div>
      {sleeping && (
        <p className="mb-2 rounded-2xl border-2 border-pastel-sky bg-pastel-sky/20 px-3 py-2 text-xs font-bold text-ui-ink">
          Durmiendo… recupera energía.
        </p>
      )}
      {err && (
        <p className="mb-2 rounded-2xl border-2 border-red-400 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          {err}
        </p>
      )}
      {pet && (
        <>
          <Bar
            label="Hambre"
            value={pet.hunger}
            barClass="bg-orange-500"
          />
          <Bar
            label="Limpieza"
            value={pet.cleanliness}
            barClass="bg-sky-500"
          />
          <Bar label="Energía" value={pet.energy} barClass="bg-lime-600" />
        </>
      )}
      {pet && !sleeping && (
        <button
          type="button"
          disabled={busy !== null}
          className="tf-btn-soft mt-4 w-full py-2.5 text-sm font-bold"
          onClick={() => setGameOpen(true)}
        >
          Jugar (salta obstáculos)
        </button>
      )}
      <PetRunnerGame
        open={gameOpen}
        onClose={() => setGameOpen(false)}
        petName={displayName}
        farmId={farmId}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null || cornCount < 1}
          className="tf-btn-soft flex-1 min-w-[7rem] sm:flex-none"
          onClick={() =>
            run("feed-corn", async () =>
              supabase.rpc("pet_feed", {
                p_farm_id: farmId,
                p_crop: "corn",
              }),
            )
          }
        >
          {busy === "feed-corn" ? "…" : "Alimentar 🌽"}
        </button>
        <button
          type="button"
          disabled={busy !== null || potatoCount < 1}
          className="tf-btn-soft flex-1 min-w-[7rem] sm:flex-none"
          onClick={() =>
            run("feed-potato", async () =>
              supabase.rpc("pet_feed", {
                p_farm_id: farmId,
                p_crop: "potato",
              }),
            )
          }
        >
          {busy === "feed-potato" ? "…" : "Alimentar 🥔"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          className="tf-btn-soft flex-1 min-w-[7rem] sm:flex-none"
          onClick={() =>
            run("bathe", async () =>
              supabase.rpc("pet_bathe", { p_farm_id: farmId }),
            )
          }
        >
          {busy === "bathe" ? "…" : "Bañar"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          className="tf-btn-soft flex-1 min-w-[7rem] sm:flex-none"
          onClick={() =>
            run("sleep", async () =>
              supabase.rpc("pet_sleep", { p_farm_id: farmId }),
            )
          }
        >
          {busy === "sleep" ? "…" : "Dormir"}
        </button>
      </div>
    </div>
  );
}
