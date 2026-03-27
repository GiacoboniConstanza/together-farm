export class Ball {
  x: number;
  y: number;
  radius: number;
  velocityX: number;
  velocityY: number;
  speed: number;

  constructor(
    x: number,
    y: number,
    radius: number,
    initialSpeed: number,
  ) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.speed = initialSpeed;
    this.velocityX = initialSpeed;
    this.velocityY = 0;
  }

  reset(centerX: number, centerY: number, initialSpeed: number): void {
    this.x = centerX;
    this.y = centerY;
    this.speed = initialSpeed;
    const dir = Math.random() < 0.5 ? -1 : 1;
    this.velocityX = dir * this.speed;
    this.velocityY = (Math.random() * 4 - 2) * (initialSpeed * 0.015);
    this.normalizeVelocity();
  }

  normalizeVelocity(): void {
    const mag = Math.hypot(this.velocityX, this.velocityY);
    if (mag < 1e-6) {
      this.velocityX = this.speed;
      this.velocityY = 0;
      return;
    }
    this.velocityX = (this.velocityX / mag) * this.speed;
    this.velocityY = (this.velocityY / mag) * this.speed;
  }
}
