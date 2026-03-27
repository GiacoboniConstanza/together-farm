import { PONG_MAX_SCORE } from "./types";

export class ScoreSystem {
  leftScore = 0;
  rightScore = 0;
  readonly maxScore: number;

  constructor(maxScore: number = PONG_MAX_SCORE) {
    this.maxScore = maxScore;
  }

  reset(): void {
    this.leftScore = 0;
    this.rightScore = 0;
  }

  isGameOver(): boolean {
    return (
      this.leftScore >= this.maxScore || this.rightScore >= this.maxScore
    );
  }
}
