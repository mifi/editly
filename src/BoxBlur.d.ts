import type { CanvasRenderingContext2D } from "canvas";

declare function boxBlurImage(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  radius: number,
  blurAlphaChannel: boolean,
  iterations: number,
);
