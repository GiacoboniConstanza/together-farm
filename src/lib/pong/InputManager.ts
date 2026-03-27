const LEFT_KEYS = new Set(["w", "W", "s", "S"]);
const RIGHT_KEYS = new Set(["ArrowUp", "ArrowDown"]);

export type ControlScheme = "local" | "host" | "guest";

export class InputManager {
  private readonly down = new Set<string>();
  private spaceJustPressed = false;

  constructor(private scheme: ControlScheme = "local") {}

  setScheme(scheme: ControlScheme): void {
    this.scheme = scheme;
    this.down.clear();
    this.spaceJustPressed = false;
  }

  attach(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  detach(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.down.clear();
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === " " && !e.repeat && this.scheme !== "guest") {
      e.preventDefault();
      this.spaceJustPressed = true;
    }

    if (this.scheme === "host" && RIGHT_KEYS.has(e.key)) return;
    if (this.scheme === "guest" && LEFT_KEYS.has(e.key)) return;

    if (LEFT_KEYS.has(e.key) || RIGHT_KEYS.has(e.key)) {
      e.preventDefault();
      this.down.add(e.key);
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (LEFT_KEYS.has(e.key) || RIGHT_KEYS.has(e.key)) {
      e.preventDefault();
      this.down.delete(e.key);
    }
  };

  leftUp(): boolean {
    return this.down.has("w") || this.down.has("W");
  }

  leftDown(): boolean {
    return this.down.has("s") || this.down.has("S");
  }

  rightUp(): boolean {
    return this.down.has("ArrowUp");
  }

  rightDown(): boolean {
    return this.down.has("ArrowDown");
  }

  consumeSpacePress(): boolean {
    const v = this.spaceJustPressed;
    this.spaceJustPressed = false;
    return v;
  }
}
