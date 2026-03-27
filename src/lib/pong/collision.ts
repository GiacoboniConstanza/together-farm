import type { Ball } from "./Ball";
import type { Paddle } from "./Paddle";

export function circleIntersectsPaddle(ball: Ball, paddle: Paddle): boolean {
  const cx = ball.x;
  const cy = ball.y;
  const r = ball.radius;
  const px = paddle.x;
  const py = paddle.y;
  const pw = paddle.width;
  const ph = paddle.height;

  const nx = Math.max(px, Math.min(cx, px + pw));
  const ny = Math.max(py, Math.min(cy, py + ph));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

/** Rebote con ángulo según punto de impacto en la paleta. */
export function bounceBallOffPaddle(
  ball: Ball,
  paddle: Paddle,
  speedBump: number,
): void {
  const hitPos = (ball.y - paddle.centerY) / (paddle.height / 2);
  const clamped = Math.max(-1, Math.min(1, hitPos));
  ball.velocityY = clamped * ball.speed;
  ball.velocityX *= -1;
  ball.speed += speedBump;
  ball.normalizeVelocity();
}
