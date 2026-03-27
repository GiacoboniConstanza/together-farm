export class Paddle {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;

  constructor(
    x: number,
    y: number,
    width: number,
    height: number,
    speed: number,
  ) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = speed;
  }

  get centerY(): number {
    return this.y + this.height / 2;
  }

  clampToCanvas(canvasHeight: number): void {
    this.y = Math.max(0, Math.min(canvasHeight - this.height, this.y));
  }
}
