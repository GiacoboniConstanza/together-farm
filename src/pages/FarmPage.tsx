import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import type { Database, Json } from "@/lib/database.types";
import { PetPanel } from "@/components/PetPanel";

type FarmRow = Database["public"]["Tables"]["farms"]["Row"];

type Tab = "farm" | "pet" | "invite";

type HarvestPending = { cropType: string; x: number; y: number };

export function FarmPage() {
  const { farmId } = useParams<{ farmId: string }>();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [farm, setFarm] = useState<FarmRow | null>(null);
  const [tab, setTab] = useState<Tab>("farm");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  const versionRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const harvestPendingRef = useRef<HarvestPending | null>(null);

  const reloadFarm = useCallback(async () => {
    if (!farmId || !supabaseConfigured) return null;
    const { data, error } = await supabase
      .from("farms")
      .select("*")
      .eq("id", farmId)
      .single();
    if (error) {
      setLoadError(error.message);
      return null;
    }
    const row = data as FarmRow;
    setLoadError(null);
    setFarm(row);
    versionRef.current = row.version;
    return row;
  }, [farmId]);

  useEffect(() => {
    void reloadFarm();
  }, [reloadFarm]);

  const sendInitToIframe = useCallback((gameState: string | null) => {
    const w = iframeRef.current?.contentWindow;
    if (!w) return;
    w.postMessage(
      {
        source: "together-farm-parent",
        type: "init",
        saveJson: gameState,
      },
      "*",
    );
  }, []);

  useEffect(() => {
    const f = farm;
    if (!f || tab !== "farm") return;
    const iframeEl = iframeRef.current;
    if (!iframeEl) return;

    function bootstrap() {
      if (!f) return;
      const gs =
        f.game_state === null || f.game_state === undefined
          ? null
          : typeof f.game_state === "string"
            ? f.game_state
            : JSON.stringify(f.game_state);
      sendInitToIframe(gs);
    }

    function embedAlreadyLoaded(): boolean {
      const el = iframeRef.current;
      if (!el) return false;
      try {
        const path = el.contentWindow?.location?.pathname ?? "";
        return path.includes("embed.html");
      } catch {
        return false;
      }
    }

    iframeEl.addEventListener("load", bootstrap, { once: true });

    if (
      iframeEl.contentDocument?.readyState === "complete" &&
      embedAlreadyLoaded()
    ) {
      queueMicrotask(bootstrap);
    }

    return () => iframeEl.removeEventListener("load", bootstrap);
  }, [farm, tab, sendInitToIframe]);

  const debouncedSave = useCallback(
    (payload: string) => {
      if (!farmId || !supabaseConfigured) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        saveTimerRef.current = null;
        const json = JSON.parse(payload) as Json;
        const expected = versionRef.current;
        const { data, error } = await supabase.rpc("save_farm_state", {
          p_farm_id: farmId,
          p_expected_version: expected,
          p_game_state: json,
        });
        if (error) {
          setSaveError(error.message);
          await reloadFarm();
          const gs =
            farm?.game_state == null ? null : JSON.stringify(farm.game_state);
          sendInitToIframe(gs);
          return;
        }
        setSaveError(null);
        if (typeof data === "number") versionRef.current = data;
        await reloadFarm();
      }, 900);
    },
    [farmId, reloadFarm, sendInitToIframe, farm?.game_state],
  );

  const commitHarvestFlow = useCallback(
    async (pending: HarvestPending) => {
      if (!farmId || !supabaseConfigured) return;
      const w = iframeRef.current?.contentWindow;
      if (!w) return;

      w.postMessage(
        { source: "together-farm-parent", type: "requestSnapshot" },
        "*",
      );

      let timeout = 0;
      const onSnap = async (ev: MessageEvent) => {
        if (ev.data?.source !== "together-farm" || ev.data?.type !== "snapshot")
          return;
        window.removeEventListener("message", onSnap);
        window.clearTimeout(timeout);
        const payload = ev.data.payload as string;
        const newState = JSON.parse(payload) as Json;
        const { data, error } = await supabase.rpc("commit_harvest", {
          p_farm_id: farmId,
          p_expected_version: versionRef.current,
          p_x: pending.x,
          p_y: pending.y,
          p_new_game_state: newState,
          p_crop_type: pending.cropType,
        });
        if (error) {
          setSaveError(error.message);
          await reloadFarm();
          const gs =
            farm?.game_state == null ? null : JSON.stringify(farm.game_state);
          sendInitToIframe(gs);
          return;
        }
        setSaveError(null);
        if (typeof data === "number") versionRef.current = data;
        await reloadFarm();
      };

      timeout = window.setTimeout(() => {
        window.removeEventListener("message", onSnap);
      }, 8000);

      window.addEventListener("message", onSnap);
    },
    [farmId, reloadFarm, sendInitToIframe, farm?.game_state],
  );

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.data?.source !== "together-farm") return;
      if (ev.data.type === "autosave") {
        debouncedSave(ev.data.payload as string);
      }
      if (ev.data.type === "harvest") {
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        harvestPendingRef.current = {
          cropType: ev.data.cropType as string,
          x: ev.data.x as number,
          y: ev.data.y as number,
        };
        void commitHarvestFlow(harvestPendingRef.current);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [debouncedSave, commitHarvestFlow]);

  useEffect(() => {
    if (!farmId || !supabaseConfigured) return;

    const ch = supabase
      .channel(`farm:${farmId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "farms",
          filter: `id=eq.${farmId}`,
        },
        () => {
          void (async () => {
            const row = await reloadFarm();
            if (!row) return;
            const gs =
              row.game_state == null
                ? null
                : typeof row.game_state === "string"
                  ? row.game_state
                  : JSON.stringify(row.game_state);
            if (tab === "farm") sendInitToIframe(gs);
          })();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pets",
          filter: `farm_id=eq.${farmId}`,
        },
        () => {
          void reloadFarm();
        },
      )
      .subscribe();

    const poll = window.setInterval(() => {
      void reloadFarm();
    }, 45000);

    return () => {
      supabase.removeChannel(ch);
      window.clearInterval(poll);
    };
  }, [farmId, reloadFarm, sendInitToIframe, tab]);

  async function createInvite() {
    if (!farmId || !supabaseConfigured) return;
    setInviteBusy(true);
    const { data, error } = await supabase.rpc("create_invite", {
      p_farm_id: farmId,
    });
    setInviteBusy(false);
    if (error) {
      setLoadError(error.message);
      return;
    }
    if (data) {
      const url = `${window.location.origin}/invite/${data}`;
      setInviteLink(url);
      void navigator.clipboard.writeText(url);
    }
  }

  if (!farmId) {
    return (
      <p className="p-8 text-center font-medium text-ui-ink">Granja no válida</p>
    );
  }

  if (loadError && !farm) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <p className="mb-4 rounded-2xl border-2 border-red-400 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          {loadError}
        </p>
        <Link to="/" className="tf-link">
          Volver
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-3 py-4 sm:px-4">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          to="/"
          className="tf-btn text-xs font-bold text-ui-ink no-underline"
        >
          ← Inicio
        </Link>
        <span className="font-display text-sm font-bold text-ui-ink sm:text-base">
          Granja {farm?.id.slice(0, 8)}… · v{farm?.version ?? "—"}
        </span>
        <nav className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          {(["farm", "pet", "invite"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-2xl border-4 px-3 py-1.5 text-sm font-bold transition-colors ${
                tab === t
                  ? "border-ui-border bg-pastel-peach text-ui-ink shadow-sticker-sm"
                  : "border-ui-border/60 bg-white/90 text-ui-ink/80 hover:border-ui-border"
              }`}
            >
              {t === "farm" ? "Granja" : t === "pet" ? "Mascota" : "Invitar"}
            </button>
          ))}
        </nav>
      </header>

      {saveError && (
        <p className="mb-3 rounded-2xl border-2 border-amber-500 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
          {saveError}
        </p>
      )}

      {tab === "farm" && (
        <div className="overflow-hidden rounded-3xl border-8 border-pastel-pink bg-pastel-mint/40 shadow-sticker">
          <div className="flex items-center justify-between gap-2 border-b-4 border-pastel-pink bg-pastel-mint px-3 py-2 sm:px-4">
            <span className="truncate font-display text-xs font-bold uppercase tracking-wide text-ui-ink sm:text-sm">
              Granja.exe
            </span>
            <div className="flex shrink-0 gap-1.5">
              <span className="h-3 w-3 rounded-full border-2 border-ui-border bg-pastel-yellow" />
              <span className="h-3 w-3 rounded-full border-2 border-ui-border bg-pastel-mint" />
              <span className="h-3 w-3 rounded-full border-2 border-ui-border bg-pastel-pink" />
            </div>
          </div>
          <div className="bg-pastel-cream/50 p-1 sm:p-2">
            <iframe
              ref={iframeRef}
              title="Granja"
              src="/farmsim/embed.html"
              className="block h-[min(70vh,560px)] w-full rounded-2xl border-4 border-ui-border bg-[#3d5c3d]"
            />
          </div>
        </div>
      )}

      {tab === "pet" && farm && (
        <div className="tf-panel mx-auto max-w-md p-6">
          <PetPanel
            farmId={farmId}
            cornCount={farm.corn_count}
            potatoCount={farm.potato_count}
            onInventoryChange={() => void reloadFarm()}
          />
        </div>
      )}

      {tab === "invite" && (
        <div className="tf-panel mx-auto max-w-lg p-6">
          <h2 className="mt-0 font-display text-2xl font-bold text-ui-ink">
            Invitar compañero
          </h2>
          <p className="text-sm font-medium text-ui-ink/75">
            Solo puede haber 2 personas por granja. El enlace caduca en 7
            días.
          </p>
          <button
            type="button"
            disabled={inviteBusy}
            onClick={() => void createInvite()}
            className="tf-btn-accent mt-4"
          >
            {inviteBusy ? "Generando…" : "Generar enlace y copiar"}
          </button>
          {inviteLink && (
            <p className="mt-4 break-all rounded-2xl border-2 border-ui-border/30 bg-white/80 p-3 font-mono text-xs text-ui-ink">
              {inviteLink}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
