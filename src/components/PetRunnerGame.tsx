import { useEffect, useId, useRef } from "react";
import petSprite from "@/assets/pet-sprite.jpg";

const STORAGE_PREFIX = "together-farm-pet-runner-best";

const GAME_W = 560;
const GAME_H = 160;
const GROUND_Y = GAME_H - 26;
const GRAVITY = 2100;
const JUMP_V = -480;
const BASE_SPEED = 240;
const MAX_SPEED = 520;

type Obstacle = { x: number; w: number; h: number };

function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  padA = 4,
  padB = 2,
) {
  return (
    ax + padA < bx + bw - padB &&
    ax + aw - padA > bx + padB &&
    ay + padA < by + bh - padB &&
    ay + ah - padA > by + padB
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  petName: string;
  farmId: string;
};

export function PetRunnerGame({ open, onClose, petName, farmId }: Props) {
  const titleId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const scoreElRef = useRef<HTMLSpanElement>(null);
  const bestElRef = useRef<HTMLSpanElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const jumpRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = petSprite;
    imgRef.current = img;
  }, []);

  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();

    let raf = 0;
    let lastTs = 0;
    let running = true;

    const player = {
      x: 68,
      y: GROUND_Y - 48,
      vy: 0,
      w: 42,
      h: 48,
    };

    const obstacles: Obstacle[] = [];
    let speed = BASE_SPEED;
    let spawnTimer = 0;
    let spawnInterval = 1.35;
    let score = 0;
    let gameOver = false;
    let timeMs = 0;

    const bestStored = (() => {
      try {
        return Number(localStorage.getItem(`${STORAGE_PREFIX}:${farmId}`)) || 0;
      } catch {
        return 0;
      }
    })();
    if (bestElRef.current) bestElRef.current.textContent = String(bestStored);

    function reset() {
      obstacles.length = 0;
      player.y = GROUND_Y - player.h;
      player.vy = 0;
      speed = BASE_SPEED;
      spawnInterval = 1.35;
      spawnTimer = 0;
      score = 0;
      gameOver = false;
      timeMs = 0;
      lastTs = 0;
      if (scoreElRef.current) scoreElRef.current.textContent = "0";
    }

    reset();

    function jumpOrRestart() {
      if (gameOver) {
        reset();
        return;
      }
      if (player.y + player.h >= GROUND_Y - 1) player.vy = JUMP_V;
    }

    jumpRef.current = jumpOrRestart;

    function syncSize() {
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      if (!wrap || !canvas) return;
      const g = canvas.getContext("2d");
      if (!g) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = wrap.clientWidth;
      if (cssW < 1) return;
      const cssH = (cssW * GAME_H) / GAME_W;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    syncSize();
    const ro = new ResizeObserver(() => syncSize());
    const wrap0 = wrapRef.current;
    if (wrap0) ro.observe(wrap0);

    function spawnObstacle() {
      const w = 18 + Math.random() * 14;
      const h = 34 + Math.random() * 18;
      obstacles.push({ x: GAME_W + 8, w, h });
    }

    function endGame() {
      if (gameOver) return;
      gameOver = true;
      try {
        const prev = Number(localStorage.getItem(`${STORAGE_PREFIX}:${farmId}`)) || 0;
        if (score > prev) {
          localStorage.setItem(`${STORAGE_PREFIX}:${farmId}`, String(score));
          if (bestElRef.current) bestElRef.current.textContent = String(score);
        }
      } catch {
        /* ignore */
      }
    }

    function tick(ts: number) {
      if (!running) return;
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      if (!wrap || !canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (lastTs === 0) lastTs = ts;
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;

      const cssW = wrap.clientWidth;
      const scale = cssW / GAME_W;

      if (!gameOver) {
        timeMs += dt * 1000;
        score += Math.floor(speed * dt * 0.08);
        speed = Math.min(MAX_SPEED, BASE_SPEED + timeMs * 0.018);
        spawnInterval = Math.max(0.52, 1.35 - timeMs * 0.00035);

        player.vy += GRAVITY * dt;
        player.y += player.vy * dt;
        if (player.y + player.h >= GROUND_Y) {
          player.y = GROUND_Y - player.h;
          player.vy = 0;
        }

        spawnTimer += dt;
        if (spawnTimer >= spawnInterval) {
          spawnTimer = 0;
          const last = obstacles[obstacles.length - 1];
          if (!last || last.x < GAME_W - 160 - Math.random() * 80) {
            spawnObstacle();
          }
        }

        for (let i = obstacles.length - 1; i >= 0; i--) {
          const o = obstacles[i]!;
          o.x -= speed * dt;
          if (o.x + o.w < -20) {
            obstacles.splice(i, 1);
            continue;
          }
          const oy = GROUND_Y - o.h;
          if (
            rectsOverlap(
              player.x,
              player.y,
              player.w,
              player.h,
              o.x,
              oy,
              o.w,
              o.h,
            )
          ) {
            endGame();
            break;
          }
        }

        if (scoreElRef.current) scoreElRef.current.textContent = String(score);
      }

      ctx.save();
      ctx.scale(scale, scale);

      const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      sky.addColorStop(0, "#CFDEF6");
      sky.addColorStop(1, "#F3F5FA");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, GAME_W, GROUND_Y);

      ctx.fillStyle = "#91D9AE";
      ctx.fillRect(0, GROUND_Y, GAME_W, GAME_H - GROUND_Y);
      ctx.strokeStyle = "#4a3737";
      ctx.lineWidth = 3 / scale;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(GAME_W, GROUND_Y);
      ctx.stroke();

      for (const o of obstacles) {
        const oy = GROUND_Y - o.h;
        ctx.fillStyle = "#D2C2F4";
        ctx.strokeStyle = "#4a3737";
        ctx.lineWidth = 2.5 / scale;
        const r = 4;
        ctx.beginPath();
        ctx.roundRect(o.x, oy, o.w, o.h, r);
        ctx.fill();
        ctx.stroke();
      }

      const img = imgRef.current;
      const bob = gameOver ? 0 : Math.sin(timeMs * 0.012) * 3;
      const drawH = player.h + 8;
      const drawW = (img?.naturalWidth && img?.naturalHeight
        ? (drawH * img.naturalWidth) / img.naturalHeight
        : player.w + 6) as number;
      const drawX = player.x - (drawW - player.w) / 2;
      const drawY = player.y - 6 + bob;

      if (img?.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
      } else {
        ctx.fillStyle = "#ACA0DC";
        ctx.strokeStyle = "#4a3737";
        ctx.lineWidth = 2 / scale;
        ctx.beginPath();
        ctx.roundRect(player.x, player.y, player.w, player.h, 6);
        ctx.fill();
        ctx.stroke();
      }

      if (gameOver) {
        ctx.fillStyle = "rgba(243, 245, 250, 0.82)";
        ctx.fillRect(0, 0, GAME_W, GAME_H);
        ctx.fillStyle = "#5a514c";
        ctx.textAlign = "center";
        ctx.font = `bold ${22 / scale}px Nunito, system-ui, sans-serif`;
        ctx.fillText("¡Chocaste!", GAME_W / 2, GAME_H / 2 - 8);
        ctx.font = `${14 / scale}px Nunito, system-ui, sans-serif`;
        ctx.fillText("Toca o espacio para reintentar", GAME_W / 2, GAME_H / 2 + 18);
      }

      ctx.restore();

      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        jumpOrRestart();
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      running = false;
      jumpRef.current = null;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, farmId, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ui-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-xl rounded-2xl border-2 border-ui-border bg-pastel-cream p-4 shadow-sticker"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id={titleId} className="font-display text-xl font-bold text-ui-ink">
              Carrera con {petName}
            </h2>
            <p className="mt-1 text-sm font-medium text-ui-ink/75">
              Espacio o flecha arriba, o toca el juego para saltar.
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

        <div className="mb-2 flex justify-between font-display text-sm font-bold text-ui-ink">
          <span>
            Puntos: <span ref={scoreElRef}>0</span>
          </span>
          <span>
            Récord: <span ref={bestElRef}>0</span>
          </span>
        </div>

        <div ref={wrapRef} className="w-full">
          <canvas
            ref={canvasRef}
            className="block w-full touch-none select-none rounded-xl border-2 border-ui-border bg-pastel-cream"
            aria-label={`Mini juego de salto con ${petName}`}
            onPointerDown={(e) => {
              e.preventDefault();
              jumpRef.current?.();
            }}
          />
        </div>
      </div>
    </div>
  );
}
