import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { ExeWindowFrame } from "@/components/ExeWindowFrame";
import { PongGameModal } from "@/components/PongGameModal";

const PONG_INVITE_EVENT = "pong_invite";
const INVITE_HEARTBEAT_MS = 3500;
const INVITE_STALE_MS = 12000;

type PongInvitePayload = {
  active: boolean;
  userId: string;
};

type Props = {
  farmId: string;
  farmCreatedBy: string;
  inviteLink: string | null;
  inviteBusy: boolean;
  onCreateInvite: () => void;
  onRewardClaimed: () => void;
};

async function fetchMemberCount(farmId: string): Promise<number> {
  if (!supabaseConfigured) return 0;
  const { data, error } = await supabase
    .from("farm_members")
    .select("user_id")
    .eq("farm_id", farmId);
  if (error) return 0;
  return (data ?? []).length;
}

function gamesChannelName(farmId: string) {
  return `farm_games:${farmId}`;
}

export function CompanionSection({
  farmId,
  farmCreatedBy,
  inviteLink,
  inviteBusy,
  onCreateInvite,
  onRewardClaimed,
}: Props) {
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [pongOpen, setPongOpen] = useState(false);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  /** userId del compañero que está con el modal Pong abierto (avisos en red). */
  const [pongInviteFrom, setPongInviteFrom] = useState<string | null>(null);

  const inviteStaleTimerRef = useRef<number>(0);
  const heartbeatTimerRef = useRef<number>(0);

  const reloadCount = useCallback(() => {
    void (async () => {
      const n = await fetchMemberCount(farmId);
      setMemberCount(n);
    })();
  }, [farmId]);

  useEffect(() => {
    reloadCount();
  }, [reloadCount]);

  useEffect(() => {
    if (!supabaseConfigured) return;
    void supabase.auth.getUser().then(({ data: { user } }) => {
      setSessionUserId(user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!farmId || !supabaseConfigured) return;

    const ch = supabase
      .channel(`companion_members:${farmId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "farm_members",
          filter: `farm_id=eq.${farmId}`,
        },
        () => {
          reloadCount();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [farmId, reloadCount]);

  const onReward = useCallback(() => {
    onRewardClaimed();
  }, [onRewardClaimed]);

  const clearInviteStaleTimer = useCallback(() => {
    if (inviteStaleTimerRef.current) {
      window.clearTimeout(inviteStaleTimerRef.current);
      inviteStaleTimerRef.current = 0;
    }
  }, []);

  const armInviteStaleTimer = useCallback(
    (fromUserId: string) => {
      clearInviteStaleTimer();
      inviteStaleTimerRef.current = window.setTimeout(() => {
        setPongInviteFrom((cur) => (cur === fromUserId ? null : cur));
        inviteStaleTimerRef.current = 0;
      }, INVITE_STALE_MS);
    },
    [clearInviteStaleTimer],
  );

  /** Canal de avisos Pong: escucha invitaciones y envía heartbeat si tenemos el modal abierto. */
  useEffect(() => {
    if (!supabaseConfigured || !farmId || !sessionUserId) return;
    if (memberCount === null || memberCount < 2) return;

    const ch: RealtimeChannel = supabase.channel(gamesChannelName(farmId), {
      config: { broadcast: { ack: false } },
    });

    const sendInvite = (active: boolean) => {
      const payload: PongInvitePayload = {
        active,
        userId: sessionUserId,
      };
      void ch.send({
        type: "broadcast",
        event: PONG_INVITE_EVENT,
        payload,
      });
    };

    ch.on("broadcast", { event: PONG_INVITE_EVENT }, ({ payload }) => {
      const p = payload as PongInvitePayload | null;
      if (!p || typeof p.userId !== "string") return;
      if (p.userId === sessionUserId) return;

      if (p.active) {
        setPongInviteFrom(p.userId);
        armInviteStaleTimer(p.userId);
      } else {
        clearInviteStaleTimer();
        setPongInviteFrom((cur) => (cur === p.userId ? null : cur));
      }
    });

    let cancelled = false;
    ch.subscribe((status) => {
      if (cancelled || status !== "SUBSCRIBED") return;
      if (pongOpen) {
        sendInvite(true);
        heartbeatTimerRef.current = window.setInterval(() => {
          sendInvite(true);
        }, INVITE_HEARTBEAT_MS);
      }
    });

    return () => {
      cancelled = true;
      if (heartbeatTimerRef.current) {
        window.clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = 0;
      }
      if (pongOpen) {
        sendInvite(false);
      }
      clearInviteStaleTimer();
      void supabase.removeChannel(ch);
    };
  }, [
    farmId,
    sessionUserId,
    memberCount,
    pongOpen,
    armInviteStaleTimer,
    clearInviteStaleTimer,
  ]);

  const openPong = useCallback(() => {
    setPongInviteFrom(null);
    clearInviteStaleTimer();
    setPongOpen(true);
  }, [clearInviteStaleTimer]);

  if (memberCount === null) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border-4 border-ui-border/40 bg-white/80 px-4 py-6 text-center text-sm font-medium text-ui-ink/70">
        Cargando…
      </div>
    );
  }

  const needsInvite = memberCount < 2;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {needsInvite && (
        <ExeWindowFrame
          title="Compañero.exe"
          className="mx-auto w-full max-w-lg"
          bodyClassName="p-4 sm:p-6"
        >
          <h2 className="mt-0 font-display text-2xl font-bold text-ui-ink">
            Tu compañero
          </h2>
          <p className="text-sm font-medium text-ui-ink/75">
            Solo puede haber 2 personas por granja. El enlace caduca en 7
            días. Cuando alguien se una, aquí verás los minijuegos para jugar
            juntos en red.
          </p>
          <button
            type="button"
            disabled={inviteBusy}
            onClick={onCreateInvite}
            className="tf-btn-soft mt-4 w-full py-2.5 text-sm font-bold"
          >
            {inviteBusy ? "Generando…" : "Generar enlace y copiar"}
          </button>
          {inviteLink && (
            <p className="mt-4 break-all rounded-2xl border-2 border-ui-border/30 bg-white/80 p-3 font-mono text-xs text-ui-ink">
              {inviteLink}
            </p>
          )}
        </ExeWindowFrame>
      )}

      {!needsInvite && (
        <ExeWindowFrame
          title="Juegos.exe"
          className="w-full"
          bodyClassName="p-4 sm:p-6"
        >
          <h2 className="mt-0 font-display text-xl font-bold text-ui-ink">
            Minijuegos con tu compañero
          </h2>
          <p className="text-sm font-medium text-ui-ink/75">
            Elegid un juego. Cuando uno abre el Pong, el otro recibe un aviso
            aquí para unirse. Las recompensas van al dinero compartido del
            simulador.
          </p>

          {pongInviteFrom && !pongOpen && (
            <div
              className="mt-4 rounded-2xl border-4 border-pastel-peach bg-pastel-peach/35 px-4 py-3 shadow-sticker-sm"
              role="status"
            >
              <p className="m-0 text-sm font-bold text-ui-ink">
                Tu compañero ha abierto el Pong y te espera.
              </p>
              <p className="mt-1 text-xs font-medium text-ui-ink/80">
                Abre el mismo juego en tu pantalla para jugar en red (ambos en
                la pestaña Compañero).
              </p>
              <button
                type="button"
                className="tf-btn mt-3 w-full py-2.5 text-sm font-bold sm:w-auto sm:px-6"
                onClick={openPong}
              >
                Abrir Pong
              </button>
            </div>
          )}

          <ul className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <li className="min-w-[140px] flex-1">
              <button
                type="button"
                className="tf-btn-soft w-full py-3 text-sm font-bold"
                onClick={openPong}
              >
                Pong
              </button>
            </li>
            <li className="min-w-[140px] flex-1">
              <button
                type="button"
                disabled
                className="w-full cursor-not-allowed rounded-2xl border-4 border-ui-border/40 bg-white/50 py-3 text-sm font-bold text-ui-ink/45"
              >
                Más juegos — pronto
              </button>
            </li>
          </ul>
        </ExeWindowFrame>
      )}

      {!needsInvite && (
        <PongGameModal
          open={pongOpen}
          onClose={() => setPongOpen(false)}
          farmId={farmId}
          farmCreatedBy={farmCreatedBy}
          onRewardClaimed={onReward}
        />
      )}
    </div>
  );
}
