import { useEffect, useId, useRef, useState } from "react";
import petSprite from "@/assets/pet-sprite.jpg";

const STORAGE_PREFIX = "together-farm-pet-runner-best";

const GAME_W = 560;
const GAME_H = 200;
const GROUND_Y = GAME_H - 28;

/** Unidades por frame a 60 Hz (spec Dino Run) */
const GRAVITY_PER_FRAME = 0.6;
const JUMP_FORCE = -12;

const BASE_GAME_SPEED = 200;
const MAX_GAME_SPEED = 540;
const SPEED_BUMP_PER_100 = 20;
const SPAWN_MIN_START = 1.0;
const SPAWN_MAX_START = 2.0;
const SPAWN_SHRINK_PER_100 = 0.08;
const SPAWN_MIN_FLOOR = 0.38;
const SPAWN_MAX_FLOOR = 0.62;
const BIRD_MIN_SCORE = 380;
const GROUND_TILE = 28;

type GameState = "waiting" | "playing" | "game_over";

type ObstacleKind = "cactus_s" | "cactus_l" | "cactus_double" | "bird";

type Obstacle = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: ObstacleKind;
};

type PlayerPose = "running" | "jumping" | "ducking";

function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  padA = 3,
  padB = 2,
) {
  return (
    ax + padA < bx + bw - padB &&
    ax + aw - padA > bx + padB &&
    ay + padA < by + bh - padB &&
    ay + ah - padA > by + padB
  );
}

function randRange(a: number, b: number) {
  return a + Math.random() * (b - a);
}

type Props = {
  open: boolean;
  onClose: () => void;
  petName: string;
  farmId: string;
};

export function PetRunnerGame({ open, onClose, petName, farmId }: Props) {
  const titleId = useId();
  const [bestScore, setBestScore] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const scoreElRef = useRef<HTMLSpanElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const pointerDuckRef = useRef(false);
  const canvasActionRef = useRef<
    ((e: React.PointerEvent<HTMLCanvasElement>) => void) | null
  >(null);

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

    let gameState: GameState = "waiting";
    let timeMs = 0;

    const STAND_H = 48;
    const DUCK_H = 28;
    const player = {
      x: 68,
      y: GROUND_Y - STAND_H,
      velocityY: 0,
      w: 42,
    };

    let duckKey = false;

    const obstacles: Obstacle[] = [];
    let gameSpeed = BASE_GAME_SPEED;
    let spawnTimer = 0.6;
    let spawnMin = SPAWN_MIN_START;
    let spawnMax = SPAWN_MAX_START;
    let score = 0;
    let lastMilestoneTier = -1;
    let milestoneFlashMs = 0;
    let groundScrollX = 0;

    let audioCtx: AudioContext | null = null;

    function ensureAudio() {
      if (audioCtx) return audioCtx;
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      try {
        audioCtx = new Ctx();
        return audioCtx;
      } catch {
        return null;
      }
    }

    function playMilestoneBeep() {
      const ctx = audioCtx;
      if (!ctx || ctx.state === "suspended") return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.09);
    }

    function onGround() {
      return player.velocityY >= 0 && player.y + STAND_H >= GROUND_Y - 0.5;
    }

    function getHitRect(): { x: number; y: number; w: number; h: number } {
      const grounded = onGround();
      const duck = grounded && (duckKey || pointerDuckRef.current);
      const h = duck ? DUCK_H : STAND_H;
      const y = grounded ? GROUND_Y - h : player.y;
      const shrinkX = 5;
      return {
        x: player.x + shrinkX,
        y,
        w: player.w - shrinkX * 2,
        h,
      };
    }

    function playerPose(): PlayerPose {
      if (!onGround()) return "jumping";
      if (duckKey || pointerDuckRef.current) return "ducking";
      return "running";
    }

    function syncScoreDom() {
      if (scoreElRef.current) scoreElRef.current.textContent = String(Math.floor(score));
    }

    function resetToWaiting() {
      pointerDuckRef.current = false;
      duckKey = false;
      obstacles.length = 0;
      player.y = GROUND_Y - STAND_H;
      player.velocityY = 0;
      gameSpeed = BASE_GAME_SPEED;
      spawnMin = SPAWN_MIN_START;
      spawnMax = SPAWN_MAX_START;
      spawnTimer = randRange(spawnMin, spawnMax) * 0.4;
      score = 0;
      lastMilestoneTier = -1;
      milestoneFlashMs = 0;
      groundScrollX = 0;
      timeMs = 0;
      lastTs = 0;
      gameState = "waiting";
      syncScoreDom();
    }

    function startPlaying() {
      gameState = "playing";
      lastTs = 0;
      spawnTimer = randRange(spawnMin, spawnMax) * 0.35;
    }

    resetToWaiting();

    function pickObstacleKind(scoreNow: number): ObstacleKind {
      const roll = Math.random();
      if (scoreNow >= BIRD_MIN_SCORE && roll < 0.22) return "bird";
      if (roll < 0.38) return "cactus_s";
      if (roll < 0.68) return "cactus_l";
      return "cactus_double";
    }

    function spawnObstacle() {
      const kind = pickObstacleKind(score);
      let w = 18;
      let h = 32;
      let y = GROUND_Y - h;

      switch (kind) {
        case "cactus_s":
          w = 16;
          h = 30;
          y = GROUND_Y - h;
          break;
        case "cactus_l":
          w = 22;
          h = 46;
          y = GROUND_Y - h;
          break;
        case "cactus_double":
          w = 40;
          h = 34;
          y = GROUND_Y - h;
          break;
        case "bird":
          w = 44;
          h = 20;
          y = GROUND_Y - 44;
          break;
        default:
          break;
      }

      obstacles.push({ x: GAME_W + 10, y, w, h, kind });
    }

    function endGame() {
      if (gameState !== "playing") return;
      gameState = "game_over";
      const finalScore = Math.floor(score);
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

    function tryJump() {
      if (gameState === "waiting") {
        ensureAudio();
        void audioCtx?.resume();
        startPlaying();
        return;
      }
      if (gameState === "game_over") {
        resetToWaiting();
        ensureAudio();
        void audioCtx?.resume();
        startPlaying();
        return;
      }
      if (gameState === "playing" && onGround()) {
        player.velocityY = JUMP_FORCE;
      }
    }

    function handleCanvasPointer(e: React.PointerEvent<HTMLCanvasElement>) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.height < 1) return;
      const ny = (e.clientY - rect.top) / rect.height;
      if (ny >= 2 / 3) {
        pointerDuckRef.current = true;
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      } else {
        ensureAudio();
        void audioCtx?.resume();
        tryJump();
      }
    }

    canvasActionRef.current = handleCanvasPointer;

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

    function checkMilestones() {
      const tier = Math.floor(score / 100);
      if (tier > lastMilestoneTier) {
        lastMilestoneTier = tier;
        if (tier >= 1) {
          playMilestoneBeep();
          milestoneFlashMs = 140;
          gameSpeed = Math.min(MAX_GAME_SPEED, gameSpeed + SPEED_BUMP_PER_100);
          spawnMin = Math.max(SPAWN_MIN_FLOOR, spawnMin - SPAWN_SHRINK_PER_100);
          spawnMax = Math.max(SPAWN_MAX_FLOOR, spawnMax - SPAWN_SHRINK_PER_100);
        }
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

      if (milestoneFlashMs > 0) milestoneFlashMs = Math.max(0, milestoneFlashMs - dt * 1000);

      if (gameState === "playing") {
        timeMs += dt * 1000;
        score += gameSpeed * dt;
        syncScoreDom();
        checkMilestones();

        groundScrollX = (groundScrollX + gameSpeed * dt) % GROUND_TILE;

        player.velocityY += GRAVITY_PER_FRAME * 60 * dt;
        player.y += player.velocityY * 60 * dt;

        if (player.y + STAND_H >= GROUND_Y) {
          const duck = duckKey || pointerDuckRef.current;
          player.y = GROUND_Y - (duck ? DUCK_H : STAND_H);
          player.velocityY = 0;
        }

        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          const last = obstacles[obstacles.length - 1];
          if (!last || last.x < GAME_W - 120) {
            spawnObstacle();
          }
          spawnTimer = randRange(spawnMin, spawnMax);
        }

        for (let i = obstacles.length - 1; i >= 0; i--) {
          const o = obstacles[i]!;
          o.x -= gameSpeed * dt;
          if (o.x + o.w < -24) {
            obstacles.splice(i, 1);
            continue;
          }
          const pr = getHitRect();
          if (rectsOverlap(pr.x, pr.y, pr.w, pr.h, o.x, o.y, o.w, o.h)) {
            endGame();
            break;
          }
        }
      } else if (gameState === "waiting") {
        timeMs += dt * 1000;
      }

      ctx.save();
      ctx.scale(scale, scale);

      const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      sky.addColorStop(0, "#CFDEF6");
      sky.addColorStop(1, "#F3F5FA");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, GAME_W, GROUND_Y);

      const grassH = GAME_H - GROUND_Y;
      ctx.fillStyle = "#7BCF96";
      ctx.fillRect(0, GROUND_Y, GAME_W, grassH);
      ctx.fillStyle = "#91D9AE";
      for (let gx = -GROUND_TILE; gx < GAME_W + GROUND_TILE; gx += GROUND_TILE) {
        const x = gx - groundScrollX;
        ctx.fillRect(x, GROUND_Y + 4, GROUND_TILE * 0.55, grassH - 4);
      }

      ctx.strokeStyle = "#4a3737";
      ctx.lineWidth = 3 / scale;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(GAME_W, GROUND_Y);
      ctx.stroke();

      for (const o of obstacles) {
        drawObstacle(ctx, scale, o);
      }

      const img = imgRef.current;
      const pose = gameState === "playing" ? playerPose() : "running";
      const runFrame = Math.floor(timeMs / 85) % 2;
      const bob =
        gameState === "game_over"
          ? 0
          : pose === "running"
            ? Math.sin(timeMs * 0.014) * 2 + runFrame * 0.8
            : pose === "jumping"
              ? Math.sin(timeMs * 0.02) * 1.5
              : 0;

      let drawH = pose === "ducking" ? STAND_H - 6 : STAND_H + 8;
      let drawY = player.y - 6 + bob;
      if (pose === "ducking") {
        drawY = GROUND_Y - drawH + 4 + bob * 0.3;
      }

      const drawW = (img?.naturalWidth && img?.naturalHeight
        ? (drawH * img.naturalWidth) / img.naturalHeight
        : player.w + 6) as number;
      const drawX = player.x - (drawW - player.w) / 2;

      if (img?.complete && img.naturalWidth > 0) {
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        if (iw >= 48) {
          const sliceW = iw / 2;
          const sx = runFrame === 0 ? 0 : sliceW;
          ctx.drawImage(img, sx, 0, sliceW, ih, drawX, drawY, drawW, drawH);
        } else {
          ctx.drawImage(img, drawX, drawY, drawW, drawH);
        }
      } else {
        ctx.fillStyle = "#ACA0DC";
        ctx.strokeStyle = "#4a3737";
        ctx.lineWidth = 2 / scale;
        const ph = pose === "ducking" ? DUCK_H : getHitRect().h;
        const py = pose === "ducking" ? GROUND_Y - DUCK_H : getHitRect().y;
        ctx.beginPath();
        ctx.roundRect(player.x, py, player.w, ph, 6);
        ctx.fill();
        ctx.stroke();
      }

      if (milestoneFlashMs > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.35 * (milestoneFlashMs / 140)})`;
        ctx.fillRect(0, 0, GAME_W, GAME_H);
      }

      if (gameState === "waiting") {
        ctx.fillStyle = "rgba(243, 245, 250, 0.72)";
        ctx.fillRect(0, 0, GAME_W, GAME_H);
        ctx.fillStyle = "#5a514c";
        ctx.textAlign = "center";
        ctx.font = `bold ${20 / scale}px Nunito, system-ui, sans-serif`;
        ctx.fillText("Listo", GAME_W / 2, GAME_H / 2 - 14);
        ctx.font = `${13 / scale}px Nunito, system-ui, sans-serif`;
        ctx.fillText("Espacio o toca arriba del juego", GAME_W / 2, GAME_H / 2 + 10);
        ctx.fillText("para empezar a correr", GAME_W / 2, GAME_H / 2 + 28);
      }

      if (gameState === "game_over") {
        ctx.fillStyle = "rgba(243, 245, 250, 0.82)";
        ctx.fillRect(0, 0, GAME_W, GAME_H);
        ctx.fillStyle = "#5a514c";
        ctx.textAlign = "center";
        ctx.font = `bold ${22 / scale}px Nunito, system-ui, sans-serif`;
        ctx.fillText("¡Chocaste!", GAME_W / 2, GAME_H / 2 - 8);
        ctx.font = `${14 / scale}px Nunito, system-ui, sans-serif`;
        ctx.fillText("Toca o espacio para jugar otra vez", GAME_W / 2, GAME_H / 2 + 18);
      }

      ctx.restore();

      raf = requestAnimationFrame(tick);
    }

    function drawObstacle(
      ctx: CanvasRenderingContext2D,
      scale: number,
      o: Obstacle,
    ) {
      ctx.lineWidth = 2.5 / scale;
      ctx.strokeStyle = "#4a3737";

      if (o.kind === "bird") {
        ctx.fillStyle = "#B8A8E8";
        ctx.beginPath();
        ctx.ellipse(
          o.x + o.w * 0.5,
          o.y + o.h * 0.55,
          o.w * 0.48,
          o.h * 0.42,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#9B8AD4";
        ctx.beginPath();
        ctx.moveTo(o.x + o.w * 0.85, o.y + o.h * 0.5);
        ctx.lineTo(o.x + o.w * 1.05, o.y + o.h * 0.55);
        ctx.lineTo(o.x + o.w * 0.88, o.y + o.h * 0.65);
        ctx.fill();
        ctx.stroke();
        return;
      }

      ctx.fillStyle = "#6BB87A";
      const r = 3;
      if (o.kind === "cactus_double") {
        const half = (o.w - 6) / 2;
        ctx.beginPath();
        ctx.roundRect(o.x + 2, o.y + 6, half, o.h - 6, r);
        ctx.roundRect(o.x + 4 + half, o.y + 2, half, o.h - 2, r);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#D2C2F4";
        ctx.beginPath();
        ctx.arc(o.x + 2 + half * 0.5, o.y + 18, 5, 0, Math.PI * 2);
        ctx.arc(o.x + 4 + half + half * 0.5, o.y + 14, 5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.roundRect(o.x, o.y, o.w, o.h, r);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#D2C2F4";
        const armY = o.y + o.h * 0.35;
        ctx.fillRect(o.x - 5, armY, 8, 5);
        ctx.fillRect(o.x + o.w - 3, armY + 4, 8, 5);
      }
    }

    raf = requestAnimationFrame(tick);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.code === "ArrowDown") {
        e.preventDefault();
        duckKey = true;
        return;
      }
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        ensureAudio();
        void audioCtx?.resume();
        tryJump();
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "ArrowDown") duckKey = false;
    }

    function onWindowPointerUp() {
      pointerDuckRef.current = false;
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("blur", onWindowPointerUp);

    return () => {
      running = false;
      canvasActionRef.current = null;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerup", onWindowPointerUp);
      window.removeEventListener("blur", onWindowPointerUp);
      if (audioCtx) void audioCtx.close();
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
              Estilo Dino Run: espacio o flecha arriba para saltar, flecha abajo para agacharte.
              Toca la parte superior del juego para saltar; la parte inferior, para agacharte.
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
            Distancia: <span ref={scoreElRef}>0</span>
          </span>
          <span>
            Récord: <span>{bestScore}</span>
          </span>
        </div>

        <div ref={wrapRef} className="w-full">
          <canvas
            ref={canvasRef}
            className="block w-full touch-none select-none rounded-xl border-2 border-ui-border bg-pastel-cream"
            aria-label={`Mini juego estilo Dino Run con ${petName}`}
            onPointerDown={(e) => {
              e.preventDefault();
              canvasActionRef.current?.(e);
            }}
            onPointerUp={() => {
              pointerDuckRef.current = false;
            }}
            onPointerCancel={() => {
              pointerDuckRef.current = false;
            }}
          />
        </div>
      </div>
    </div>
  );
}
