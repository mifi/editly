// https://easings.net/

export type EasingFunction = (progress: number) => number;

export const easeOutExpo: EasingFunction = (x: number) => (x === 1 ? 1 : 1 - 2 ** (-10 * x));
export const easeInOutCubic: EasingFunction = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
export const linear: EasingFunction = (x: number) => x;
