import { Ball } from "./Ball";
import { InputManager } from "./InputManager";
import { Paddle } from "./Paddle";
import { ScoreSystem } from "./ScoreSystem";
import { bounceBallOffPaddle, circleIntersectsPaddle } from "./collision";
import type { HostSnapshot } from "./networkTypes";
import { PONG_MAX_SCORE, type PongPhase } from "./types";

const POINT_PAUSE_SEC = 0.75;
const INITIAL_BALL_SPEED = 300;
const SPEED_BUMP = 0.2;
const PADDLE_MARGIN = 20;

export type PongGameOverPayload = {
  leftScore: number;
  rightScore: number;
};

export type PongNetworkRole = "host" | "guest" | "local";

export class PongGame {
  readonly canvasW: number;
  readonly canvasH: number;
  readonly input: InputManager;
  readonly leftPaddle: Paddle;
  readonly rightPaddle: Paddle;
  readonly ball: Ball;
  readonly scores: ScoreSystem;
  readonly networkRole: PongNetworkRole;

  phase: PongPhase = "MENU";
  private pointPauseAccum = 0;
  private gameOverEmitted = false;
  private readonly initialBallSpeed: number;

  /** Anfitrión: el invitado está en el canal y puede empezar partida. */
  canStartOnline = false;

  /** Anfitrión: última Y de la paleta derecha recibida por red. */
  private remoteRightPaddleY: number;

  /** Invitado: Y local que se envía al anfitrión (no confiar solo en snapshot para input). */
  private guestSentPaddleY: number;

  /** Invitado: ya recibió al menos un snapshot del anfitrión. */
  guestSynced = false;

  onGameOver: ((payload: PongGameOverPayload) => void) | null = null;
  onMatchStart: (() => void) | null = null;

  constructor(width: number, height: number, role: PongNetworkRole) {
    this.canvasW = width;
    this.canvasH = height;
    this.networkRole = role;
    this.initialBallSpeed = INITIAL_BALL_SPEED;

    const scheme =
      role === "host" ? "host" : role === "guest" ? "guest" : "local";
    this.input = new InputManager(scheme);

    const ph = 72;
    const pw = 12;
    const py = height / 2 - ph / 2;
    const speed = 380;

    this.leftPaddle = new Paddle(PADDLE_MARGIN, py, pw, ph, speed);
    this.rightPaddle = new Paddle(
      width - PADDLE_MARGIN - pw,
      py,
      pw,
      ph,
      speed,
    );
    this.ball = new Ball(width / 2, height / 2, 8, this.initialBallSpeed);
    this.scores = new ScoreSystem(PONG_MAX_SCORE);
    this.remoteRightPaddleY = py;
    this.guestSentPaddleY = py;
  }

  startLoop(): void {
    this.input.attach();
  }

  stopLoop(): void {
    this.input.detach();
  }

  setCanStartOnline(v: boolean): void {
    this.canStartOnline = v;
  }

  setRemoteRightPaddleY(y: number): void {
    this.remoteRightPaddleY = y;
  }

  getGuestPaddleY(): number {
    return this.guestSentPaddleY;
  }

  getHostSnapshot(): HostSnapshot {
    const b = this.ball;
    return {
      phase: this.phase,
      ball: {
        x: b.x,
        y: b.y,
        vx: b.velocityX,
        vy: b.velocityY,
        speed: b.speed,
        r: b.radius,
      },
      leftY: this.leftPaddle.y,
      rightY: this.rightPaddle.y,
      leftScore: this.scores.leftScore,
      rightScore: this.scores.rightScore,
    };
  }

  applyHostSnapshot(s: HostSnapshot): void {
    this.phase = s.phase;
    const b = this.ball;
    b.x = s.ball.x;
    b.y = s.ball.y;
    b.velocityX = s.ball.vx;
    b.velocityY = s.ball.vy;
    b.speed = s.ball.speed;
    b.radius = s.ball.r;
    this.leftPaddle.y = s.leftY;
    this.rightPaddle.y = s.rightY;
    this.scores.leftScore = s.leftScore;
    this.scores.rightScore = s.rightScore;
    this.guestSentPaddleY = s.rightY;
    this.guestSynced = true;
  }

  private resetPositions(): void {
    const ph = this.leftPaddle.height;
    const py = this.canvasH / 2 - ph / 2;
    this.leftPaddle.y = py;
    this.rightPaddle.y = py;
    this.remoteRightPaddleY = py;
    this.guestSentPaddleY = py;
    this.ball.reset(
      this.canvasW / 2,
      this.canvasH / 2,
      this.initialBallSpeed,
    );
  }

  private enterPlaying(): void {
    this.phase = "PLAYING";
    this.gameOverEmitted = false;
    this.scores.reset();
    this.resetPositions();
    this.onMatchStart?.();
  }

  private mayStartFromMenu(): boolean {
    if (this.networkRole === "local") return true;
    if (this.networkRole === "host") return this.canStartOnline;
    return false;
  }

  update(dt: number): void {
    if (this.networkRole === "guest") {
      this.updateGuestInput(dt);
      return;
    }

    if (this.input.consumeSpacePress()) {
      if (this.phase === "MENU" && this.mayStartFromMenu()) {
        this.enterPlaying();
        return;
      }
      if (this.phase === "GAME_OVER") {
        this.phase = "MENU";
        this.scores.reset();
        this.resetPositions();
        return;
      }
    }

    if (this.phase === "MENU" || this.phase === "GAME_OVER") {
      return;
    }

    if (this.phase === "POINT_SCORED") {
      this.pointPauseAccum += dt;
      if (this.pointPauseAccum >= POINT_PAUSE_SEC) {
        this.pointPauseAccum = 0;
        this.phase = "PLAYING";
        this.ball.reset(
          this.canvasW / 2,
          this.canvasH / 2,
          this.initialBallSpeed,
        );
      }
      return;
    }

    this.updateHostPlaying(dt);
  }

  private updateGuestInput(dt: number): void {
    const rp = this.rightPaddle;
    if (this.input.rightUp()) this.guestSentPaddleY -= rp.speed * dt;
    if (this.input.rightDown()) this.guestSentPaddleY += rp.speed * dt;
    const ph = rp.height;
    this.guestSentPaddleY = Math.max(
      0,
      Math.min(this.canvasH - ph, this.guestSentPaddleY),
    );
  }

  private updateHostPlaying(dt: number): void {
    const lp = this.leftPaddle;
    const rp = this.rightPaddle;
    const b = this.ball;

    if (this.input.leftUp()) lp.y -= lp.speed * dt;
    if (this.input.leftDown()) lp.y += lp.speed * dt;
    lp.clampToCanvas(this.canvasH);

    if (this.networkRole === "host") {
      const ph = rp.height;
      rp.y = Math.max(
        0,
        Math.min(this.canvasH - ph, this.remoteRightPaddleY),
      );
    } else {
      if (this.input.rightUp()) rp.y -= rp.speed * dt;
      if (this.input.rightDown()) rp.y += rp.speed * dt;
      rp.clampToCanvas(this.canvasH);
    }

    b.x += b.velocityX * dt;
    b.y += b.velocityY * dt;

    if (b.y - b.radius <= 0) {
      b.y = b.radius;
      b.velocityY *= -1;
    } else if (b.y + b.radius >= this.canvasH) {
      b.y = this.canvasH - b.radius;
      b.velocityY *= -1;
    }

    if (b.velocityX < 0 && circleIntersectsPaddle(b, lp)) {
      b.x = lp.x + lp.width + b.radius + 1;
      bounceBallOffPaddle(b, lp, SPEED_BUMP);
    } else if (b.velocityX > 0 && circleIntersectsPaddle(b, rp)) {
      b.x = rp.x - b.radius - 1;
      bounceBallOffPaddle(b, rp, SPEED_BUMP);
    }

    if (b.x - b.radius < 0) {
      this.scores.rightScore += 1;
      this.afterPoint();
    } else if (b.x + b.radius > this.canvasW) {
      this.scores.leftScore += 1;
      this.afterPoint();
    }
  }

  private afterPoint(): void {
    if (this.scores.isGameOver()) {
      this.phase = "GAME_OVER";
      if (
        !this.gameOverEmitted &&
        this.onGameOver &&
        (this.networkRole === "host" || this.networkRole === "local")
      ) {
        this.gameOverEmitted = true;
        this.onGameOver({
          leftScore: this.scores.leftScore,
          rightScore: this.scores.rightScore,
        });
      }
      return;
    }
    this.phase = "POINT_SCORED";
    this.pointPauseAccum = 0;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const w = this.canvasW;
    const h = this.canvasH;

    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 12]);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(
      this.leftPaddle.x,
      this.leftPaddle.y,
      this.leftPaddle.width,
      this.leftPaddle.height,
    );
    ctx.fillRect(
      this.rightPaddle.x,
      this.rightPaddle.y,
      this.rightPaddle.width,
      this.rightPaddle.height,
    );

    ctx.beginPath();
    ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = "bold 28px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.textAlign = "center";
    ctx.fillText(`${this.scores.leftScore}`, w * 0.25, 44);
    ctx.fillText(`${this.scores.rightScore}`, w * 0.75, 44);

    ctx.font = "600 14px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.55)";

    if (this.networkRole === "guest" && !this.guestSynced) {
      ctx.fillText("Sincronizando con el anfitrión…", w / 2, h / 2 - 8);
      return;
    }

    if (this.phase === "MENU") {
      if (this.networkRole === "host") {
        ctx.fillText(
          this.canStartOnline
            ? "Espacio — iniciar · Tú: izquierda (W/S) · Compañero: derecha (en su pantalla)"
            : "Esperando que tu compañero abra Compañero (pestaña)…",
          w / 2,
          h / 2 - 8,
        );
      } else if (this.networkRole === "guest") {
        ctx.fillText(
          "Esperando a que el anfitrión pulse espacio… · Tú: derecha (↑/↓)",
          w / 2,
          h / 2 - 8,
        );
      } else {
        ctx.fillText("Espacio — empezar  ·  W/S vs ↑/↓", w / 2, h / 2 - 8);
      }
    } else if (this.phase === "GAME_OVER") {
      ctx.fillText(
        this.networkRole === "host"
          ? "Fin — espacio para menú"
          : "Fin de partida (el anfitrión puede volver al menú con espacio)",
        w / 2,
        h / 2 - 8,
      );
    } else if (this.phase === "POINT_SCORED") {
      ctx.fillText("Punto…", w / 2, h / 2 - 8);
    } else if (this.phase === "PLAYING") {
      const hint =
        this.networkRole === "host"
          ? "W/S"
          : this.networkRole === "guest"
            ? "↑/↓"
            : "";
      if (hint) {
        ctx.font = "600 12px system-ui, sans-serif";
        ctx.fillText(`Tú: ${hint}`, w / 2, h - 14);
      }
    }
  }
}
