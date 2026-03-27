import { useEffect, useId, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { PONG_MAX_SCORE } from "@/lib/pong/types";
import { PongGame } from "@/lib/pong/PongGame";
import {
  type HostSnapshot,
  PONG_BROADCAST_GUEST_PADDLE,
  PONG_BROADCAST_HOST_STATE,
} from "@/lib/pong/networkTypes";

const LOGICAL_W = 640;
const LOGICAL_H = 360;
const BROADCAST_MS = 33;

type RpcReward = {
  granted_cash?: number;
  new_cash?: number;
};

type PrepState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      role: "host" | "guest";
      userId: string;
      memberIds: Set<string>;
    };

function parseReward(data: unknown): RpcReward | null {
  if (data === null || data === undefined) return null;
  if (typeof data === "object" && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    const g = o.granted_cash;
    const n = o.new_cash;
    return {
      granted_cash: typeof g === "number" ? g : Number(g),
      new_cash: typeof n === "number" ? n : Number(n),
    };
  }
  return null;
}

function presenceHasAllMembers(
  presenceState: Record<string, unknown[]>,
  required: Set<string>,
): boolean {
  const seen = new Set<string>();
  for (const metas of Object.values(presenceState)) {
    for (const row of metas) {
      const uid = (row as { user_id?: string }).user_id;
      if (typeof uid === "string") seen.add(uid);
    }
  }
  for (const id of required) {
    if (!seen.has(id)) return false;
  }
  return required.size >= 2;
}

function parseHostSnapshot(raw: unknown): HostSnapshot | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.phase !== "string") return null;
  const ball = o.ball;
  if (ball === null || typeof ball !== "object" || Array.isArray(ball))
    return null;
  const b = ball as Record<string, unknown>;
  const nums = ["x", "y", "vx", "vy", "speed", "r"] as const;
  for (const k of nums) {
    if (typeof b[k] !== "number") return null;
  }
  if (
    typeof o.leftY !== "number" ||
    typeof o.rightY !== "number" ||
    typeof o.leftScore !== "number" ||
    typeof o.rightScore !== "number"
  ) {
    return null;
  }
  return o as unknown as HostSnapshot;
}

type Props = {
  open: boolean;
  onClose: () => void;
  farmId: string;
  farmCreatedBy: string;
  onRewardClaimed: () => void;
};

export function PongGameModal({
  open,
  onClose,
  farmId,
  farmCreatedBy,
  onRewardClaimed,
}: Props) {
  const titleId = useId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const onRewardRef = useRef(onRewardClaimed);
  onRewardRef.current = onRewardClaimed;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [prep, setPrep] = useState<PrepState>({ kind: "loading" });
  const [rewardLine, setRewardLine] = useState<string | null>(null);
  const [rpcError, setRpcError] = useState<string | null>(null);
  const claimingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    if (!supabaseConfigured) {
      setPrep({
        kind: "error",
        message: "Supabase no está configurado.",
      });
      return;
    }

    let cancelled = false;
    setPrep({ kind: "loading" });

    void (async () => {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (authErr || !user) {
        setPrep({
          kind: "error",
          message: "Inicia sesión para jugar con tu compañero.",
        });
        return;
      }

      const { data: rows, error: memErr } = await supabase
        .from("farm_members")
        .select("user_id")
        .eq("farm_id", farmId);

      if (cancelled) return;
      if (memErr) {
        setPrep({
          kind: "error",
          message: memErr.message,
        });
        return;
      }

      const memberIds = new Set(
        (rows ?? []).map((r) => (r as { user_id: string }).user_id),
      );

      if (memberIds.size !== 2) {
        setPrep({
          kind: "error",
          message:
            "Tiene que haber 2 miembros en la granja. Invita a tu compañero desde Compañero.",
        });
        return;
      }

      if (!memberIds.has(user.id)) {
        setPrep({
          kind: "error",
          message: "No eres miembro de esta granja.",
        });
        return;
      }

      const role = user.id === farmCreatedBy ? "host" : "guest";
      setPrep({ kind: "ok", role, userId: user.id, memberIds });
    })();

    return () => {
      cancelled = true;
    };
  }, [open, farmId, farmCreatedBy]);

  useEffect(() => {
    if (!open || !supabaseConfigured || prep.kind !== "ok") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(LOGICAL_W * dpr);
    canvas.height = Math.round(LOGICAL_H * dpr);
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.style.maxWidth = `${LOGICAL_W}px`;
    canvas.style.display = "block";
    canvas.style.margin = "0 auto";
    canvas.style.borderRadius = "12px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const game = new PongGame(LOGICAL_W, LOGICAL_H, prep.role);
    game.startLoop();

    game.onMatchStart = () => {
      setRewardLine(null);
      setRpcError(null);
    };

    game.onGameOver = (payload) => {
      if (!supabaseConfigured || claimingRef.current) return;
      claimingRef.current = true;
      setRpcError(null);
      void (async () => {
        const { data, error } = await supabase.rpc("grant_pong_cash_reward", {
          p_farm_id: farmId,
          p_left_score: payload.leftScore,
          p_right_score: payload.rightScore,
          p_max_score: PONG_MAX_SCORE,
        });
        claimingRef.current = false;
        if (error) {
          setRewardLine(null);
          setRpcError(friendlyRpcError(error.message));
          return;
        }
        const r = parseReward(data);
        if (r?.granted_cash != null && Number.isFinite(r.granted_cash)) {
          const nc =
            r.new_cash != null && Number.isFinite(r.new_cash)
              ? Math.floor(r.new_cash)
              : null;
          setRewardLine(
            nc != null
              ? `+${Math.floor(r.granted_cash)} $ al bolsillo de la granja (total sim: $${nc}).`
              : `+${Math.floor(r.granted_cash)} $ al bolsillo de la granja.`,
          );
        } else {
          setRewardLine("Recompensa aplicada.");
        }
        onRewardRef.current();
      })();
    };

    const guestPrevPhaseRef = { current: "" as string };

    const channel: RealtimeChannel = supabase.channel(`pong:${farmId}`, {
      config: {
        broadcast: { ack: false },
        presence: { key: prep.userId },
      },
    });

    if (prep.role === "host") {
      channel.on("broadcast", { event: PONG_BROADCAST_GUEST_PADDLE }, (msg) => {
        const raw = msg.payload as { y?: unknown };
        if (typeof raw?.y === "number" && Number.isFinite(raw.y)) {
          game.setRemoteRightPaddleY(raw.y);
        }
      });
    } else {
      channel.on("broadcast", { event: PONG_BROADCAST_HOST_STATE }, (msg) => {
        const snap = parseHostSnapshot(msg.payload);
        if (!snap) return;
        const prev = guestPrevPhaseRef.current;
        game.applyHostSnapshot(snap);
        if (
          prep.role === "guest" &&
          snap.phase === "GAME_OVER" &&
          prev !== "GAME_OVER"
        ) {
          onRewardRef.current();
        }
        guestPrevPhaseRef.current = snap.phase;
      });
    }

    channel
      .on("presence", { event: "sync" }, () => {
        if (prep.role !== "host") return;
        const ok = presenceHasAllMembers(
          channel.presenceState() as Record<string, unknown[]>,
          prep.memberIds,
        );
        game.setCanStartOnline(ok);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: prep.userId });
        }
      });

    let raf = 0;
    let last = performance.now();
    let lastBroadcast = 0;
    let running = true;

    const loop = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      game.update(dt);

      if (prep.role === "host" && now - lastBroadcast >= BROADCAST_MS) {
        lastBroadcast = now;
        void channel.send({
          type: "broadcast",
          event: PONG_BROADCAST_HOST_STATE,
          payload: game.getHostSnapshot(),
        });
      }

      if (prep.role === "guest" && now - lastBroadcast >= BROADCAST_MS) {
        lastBroadcast = now;
        void channel.send({
          type: "broadcast",
          event: PONG_BROADCAST_GUEST_PADDLE,
          payload: { y: game.getGuestPaddleY() },
        });
      }

      game.draw(ctx);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      game.stopLoop();
      game.onGameOver = null;
      game.onMatchStart = null;
      window.removeEventListener("keydown", onKeyDown);
      void supabase.removeChannel(channel);
    };
  }, [open, farmId, prep]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ui-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative my-auto w-full max-w-2xl rounded-2xl border-2 border-ui-border bg-pastel-cream p-4 shadow-sticker sm:p-5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2
              id={titleId}
              className="font-display text-xl font-bold text-ui-ink"
            >
              Pong — 2 jugadores en red
            </h2>
            <p className="mt-1 text-sm font-medium text-ui-ink/75">
              Anfitrión: izquierda (W/S). Compañero: derecha (↑/↓). Si entraste
              primero, a tu compañero le debería aparecer un aviso en
              Juegos.exe para abrir el Pong. Dinero al cash del simulador.
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="tf-btn-soft shrink-0 px-4 py-2 text-sm font-bold"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>

        {!supabaseConfigured && (
          <p className="mb-2 text-sm font-medium text-amber-800">
            Supabase no está configurado.
          </p>
        )}

        {prep.kind === "loading" && (
          <p className="text-sm font-medium text-ui-ink/70">
            Preparando partida…
          </p>
        )}
        {prep.kind === "error" && (
          <p className="rounded-2xl border-2 border-amber-500/50 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
            {prep.message}
          </p>
        )}
        {prep.kind === "ok" && (
          <p className="mb-2 text-xs font-medium text-ui-ink/60">
            {prep.role === "host"
              ? "Eres el anfitrión (izquierda)."
              : "Eres el compañero (derecha)."}
          </p>
        )}

        {prep.kind === "ok" && (
          <div className="mt-2 rounded-xl border-2 border-ui-border bg-[#0a0a0f] p-2">
            <canvas ref={canvasRef} aria-label="Pong dos jugadores en red" />
          </div>
        )}

        {rpcError && (
          <p className="mt-3 rounded-2xl border-2 border-red-400 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            {rpcError}
          </p>
        )}
        {rewardLine && (
          <p className="mt-3 rounded-2xl border-2 border-emerald-500/40 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
            {rewardLine}
          </p>
        )}
      </div>
    </div>
  );
}

function friendlyRpcError(raw: string): string {
  if (raw.includes("no_game_state")) {
    return "Aún no hay partida guardada en la granja. Entra en Granja, juega un poco para que exista estado, y vuelve.";
  }
  if (raw.includes("pong_reward_cooldown")) {
    return "Espera unos segundos entre partidas recompensadas (anti-spam).";
  }
  if (raw.includes("not_finished") || raw.includes("bad_scores")) {
    return "No se pudo validar el resultado de la partida.";
  }
  if (raw.includes("bad_max_score")) {
    return "Versión del juego desincronizada con el servidor.";
  }
  if (raw.includes("forbidden")) {
    return "No tienes permiso en esta granja.";
  }
  return raw;
}
