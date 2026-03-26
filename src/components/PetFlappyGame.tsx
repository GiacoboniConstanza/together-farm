import { useEffect, useId, useRef, useState } from "react";
import petSprite from "@/assets/pet-sprite.jpg";

const STORAGE_PREFIX = "together-farm-pet-flappy-best";

const GAME_W = 560;
const GAME_H = 320;
const GROUND_Y = GAME_H - 28;
const CEILING = 0;

const GRAVITY = 920;
const JUMP_V = -340;

const BASE_SPEED = 175;
const MAX_SPEED = 340;
const SPEED_BUMP = 22;
const INITIAL_GAP = 120;
const MIN_GAP = 72;
const GAP_SHRINK = 2;
const SCORE_PER_TIER = 5;

const PIPE_W = 54;
const PIPE_SPAWN_X = GAME_W + 24;
const PIPE_SPACING_MIN = 200;
const PIPE_SPACING_EXTRA = 90;

type GameState = "idle" | "playing" | "game_over";

type Pipe = {
  x: number;
  w: number;
  gapCenterY: number;
  gapHeight: number;
  passed: boolean;
};

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

function randomGapCenter(gapH: number): number {
  const marginTop = 52;
  const marginBottom = GROUND_Y - 52;
  const half = gapH / 2;
  const low = marginTop + half;
  const high = marginBottom - half;
  return low + Math.random() * Math.max(8, high - low);
}

type Props = {
  open: boolean;
  onClose: () => void;
  petName: string;
  farmId: string;
};

export function PetFlappyGame({ open, onClose, petName, farmId }: Props) {
  const titleId = useId();
  const [bestScore, setBestScore] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const scoreElRef = useRef<HTMLSpanElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const actionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!open) return;
    try {
      const v = Number(localStorage.getItem(`${STORAGE_PREFIX}:${farmId}`));
      setBestScore(Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
    } catch {
      setBestScore(0);
    }
  }, [open, farmId]);

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

    let gameState: GameState = "idle";
    let timeMs = 0;

    const player = {
      x: Math.round(GAME_W * 0.26),
      y: GROUND_Y / 2 - 28,
      vy: 0,
      w: 42,
      h: 48,
    };

    const pipes: Pipe[] = [];
    let speed = BASE_SPEED;
    let gapHeight = INITIAL_GAP;
    let score = 0;

    function applyDifficultyFromScore() {
      const tier = Math.floor(score / SCORE_PER_TIER);
      speed = Math.min(MAX_SPEED, BASE_SPEED + tier * SPEED_BUMP);
      gapHeight = Math.max(MIN_GAP, INITIAL_GAP - tier * GAP_SHRINK);
    }

    function resetForNewRun() {
      pipes.length = 0;
      player.y = GROUND_Y / 2 - player.h / 2;
      player.vy = 0;
      score = 0;
      speed = BASE_SPEED;
      gapHeight = INITIAL_GAP;
      timeMs = 0;
      lastTs = 0;
      if (scoreElRef.current) scoreElRef.current.textContent = "0";
    }

    function spawnPipe(atX: number) {
      const gh = gapHeight;
      pipes.push({
        x: atX,
        w: PIPE_W,
        gapCenterY: randomGapCenter(gh),
        gapHeight: gh,
        passed: false,
      });
    }

    function pipeSpacingNext() {
      return PIPE_SPACING_MIN + Math.random() * PIPE_SPACING_EXTRA;
    }

    function ensureInitialPipes() {
      if (pipes.length > 0) return;
      let x = PIPE_SPAWN_X;
      for (let i = 0; i < 3; i++) {
        spawnPipe(x);
        x += pipeSpacingNext();
      }
    }

    function endGame() {
      if (gameState !== "playing") return;
      gameState = "game_over";
      const finalScore = score;
      try {
        const raw = localStorage.getItem(`${STORAGE_PREFIX}:${farmId}`);
        const prev = Number(raw);
        const prevOk = Number.isFinite(prev) ? prev : 0;
        if (finalScore > prevOk) {
          localStorage.setItem(`${STORAGE_PREFIX}:${farmId}`, String(finalScore));
          setBestScore(finalScore);
        }
      } catch {
        /* ignore */
      }
    }

    function pipeRects(p: Pipe) {
      const half = p.gapHeight / 2;
      const gapTop = p.gapCenterY - half;
      const gapBottom = p.gapCenterY + half;
      return {
        top: { x: p.x, y: CEILING, w: p.w, h: Math.max(0, gapTop - CEILING) },
        bottom: {
          x: p.x,
          y: gapBottom,
          w: p.w,
          h: Math.max(0, GROUND_Y - gapBottom),
        },
      };
    }

    function checkCollisions() {
      if (player.y + player.h >= GROUND_Y) {
        endGame();
        return;
      }
      if (player.y < CEILING + 2) {
        endGame();
        return;
      }
      for (const p of pipes) {
        const { top, bottom } = pipeRects(p);
        if (top.h > 0 &&
          rectsOverlap(
            player.x,
            player.y,
            player.w,
            player.h,
            top.x,
            top.y,
            top.w,
            top.h,
          )
        ) {
          endGame();
          return;
        }
        if (bottom.h > 0 &&
          rectsOverlap(
            player.x,
            player.y,
            player.w,
            player.h,
            bottom.x,
            bottom.y,
            bottom.w,
            bottom.h,
          )
        ) {
          endGame();
          return;
        }
      }
    }

    function onAction() {
      if (gameState === "idle") {
        resetForNewRun();
        ensureInitialPipes();
        gameState = "playing";
        player.vy = JUMP_V;
        return;
      }
      if (gameState === "playing") {
        player.vy = JUMP_V;
        return;
      }
      if (gameState === "game_over") {
        resetForNewRun();
        ensureInitialPipes();
        gameState = "playing";
        player.vy = JUMP_V;
      }
    }

    actionRef.current = onAction;

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

    resetForNewRun();
    gameState = "idle";

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

      if (gameState === "playing") {
        applyDifficultyFromScore();

        player.vy += GRAVITY * dt;
        player.y += player.vy * dt;

        for (let i = pipes.length - 1; i >= 0; i--) {
          const p = pipes[i]!;
          p.x -= speed * dt;

          if (!p.passed && p.x + p.w < player.x) {
            p.passed = true;
            score += 1;
            if (scoreElRef.current) scoreElRef.current.textContent = String(score);
            applyDifficultyFromScore();
          }

          if (p.x + p.w < -40) {
            pipes.splice(i, 1);
          }
        }

        const furthestX = pipes.length
          ? Math.max(...pipes.map((p) => p.x))
          : -1e9;
        if (furthestX < GAME_W - 200) {
          spawnPipe(
            furthestX < -1e8 ? PIPE_SPAWN_X : furthestX + pipeSpacingNext(),
          );
        }

        checkCollisions();
      }

      ctx.save();
      ctx.scale(scale, scale);

      const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      sky.addColorStop(0, "#B8D4F0");
      sky.addColorStop(1, "#E8EEF8");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, GAME_W, GROUND_Y);

      ctx.fillStyle = "#7BC96F";
      ctx.fillRect(0, GROUND_Y, GAME_W, GAME_H - GROUND_Y);
      ctx.strokeStyle = "#4a3737";
      ctx.lineWidth = 3 / scale;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(GAME_W, GROUND_Y);
      ctx.stroke();

      ctx.fillStyle = "#6EB5A8";
      ctx.strokeStyle = "#4a3737";
      ctx.lineWidth = 2.5 / scale;
      const cap = 8;
      for (const p of pipes) {
        const { top, bottom } = pipeRects(p);
        if (top.h > 0) {
          ctx.beginPath();
          ctx.roundRect(top.x, top.y, top.w, top.h + cap, 4);
          ctx.fill();
          ctx.stroke();
        }
        if (bottom.h > 0) {
          ctx.beginPath();
          ctx.roundRect(bottom.x, bottom.y - cap, bottom.w, bottom.h + cap, 4);
          ctx.fill();
          ctx.stroke();
        }
      }

      const img = imgRef.current;
      const bob =
        gameState === "idle" ? Math.sin(timeMs * 0.006) * 4 : 0;
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

      if (gameState === "idle") {
        ctx.fillStyle = "rgba(243, 245, 250, 0.72)";
        ctx.fillRect(0, 0, GAME_W, GAME_H);
        ctx.fillStyle = "#5a514c";
        ctx.textAlign = "center";
        ctx.font = `bold ${20 / scale}px Nunito, system-ui, sans-serif`;
        ctx.fillText("Toca o espacio para volar", GAME_W / 2, GAME_H / 2 - 6);
        ctx.font = `${13 / scale}px Nunito, system-ui, sans-serif`;
        ctx.fillText("Evita los tubos y el suelo", GAME_W / 2, GAME_H / 2 + 18);
      } else if (gameState === "game_over") {
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

      timeMs += dt * 1000;
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
        onAction();
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      running = false;
      actionRef.current = null;
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
              Vuelo de {petName}
            </h2>
            <p className="mt-1 text-sm font-medium text-ui-ink/75">
              Un toque o espacio: subir. Sobrevive y suma puntos al pasar tubos.
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
            Récord: <span>{bestScore}</span>
          </span>
        </div>

        <div ref={wrapRef} className="w-full">
          <canvas
            ref={canvasRef}
            className="block w-full touch-none select-none rounded-xl border-2 border-ui-border bg-pastel-cream"
            aria-label={`Mini juego vuelo con ${petName}`}
            onPointerDown={(e) => {
              e.preventDefault();
              actionRef.current?.();
            }}
          />
        </div>
      </div>
    </div>
  );
}
