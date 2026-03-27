import type { PongPhase } from "./types";

/** Estado autoritativo enviado del anfitrión al invitado. */
export type HostSnapshot = {
  phase: PongPhase;
  ball: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    speed: number;
    r: number;
  };
  leftY: number;
  rightY: number;
  leftScore: number;
  rightScore: number;
};

export const PONG_BROADCAST_HOST_STATE = "host_state";
export const PONG_BROADCAST_GUEST_PADDLE = "guest_paddle";

export type GuestPaddlePayload = { y: number };
