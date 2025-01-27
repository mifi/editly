import assert from "assert";
import type { EasingFunction } from "./easings.js";
import * as easings from "./easings.js";

/**
 * @see [Transition types]{@link https://github.com/mifi/editly#transition-types}
 */
export type TransitionType =
  | "directional-left"
  | "directional-right"
  | "directional-up"
  | "directional-down"
  | "random"
  | "dummy"
  | string;

/**
 * WARNING: Undocumented feature!
 */
export type GLTextureLike = {
  bind: (unit: number) => number;
  shape: [number, number];
};

/**
 * WARNING: Undocumented feature!
 */
export interface TransitionParams {
  /**
   * WARNING: Undocumented feature!
   */
  [key: string]: number | boolean | GLTextureLike | number[];
}

/**
 * @see [Curve types]{@link https://trac.ffmpeg.org/wiki/AfadeCurves}
 */
export type CurveType =
  | "tri"
  | "qsin"
  | "hsin"
  | "esin"
  | "log"
  | "ipar"
  | "qua"
  | "cub"
  | "squ"
  | "cbr"
  | "par"
  | "exp"
  | "iqsin"
  | "ihsin"
  | "dese"
  | "desi"
  | "losi"
  | "nofade"
  | string;

export type Easing = keyof typeof easings;

export interface TransitionOptions {
  /**
   * Transition duration.
   *
   * @default 0.5
   */
  duration?: number;

  /**
   * Transition type.
   *
   * @default 'random'
   * @see [Transition types]{@link https://github.com/mifi/editly#transition-types}
   */
  name?: TransitionType;

  /**
   * [Fade out curve]{@link https://trac.ffmpeg.org/wiki/AfadeCurves} in audio cross fades.
   *
   * @default 'tri'
   */
  audioOutCurve?: CurveType;

  /**
   * [Fade in curve]{@link https://trac.ffmpeg.org/wiki/AfadeCurves} in audio cross fades.
   *
   * @default 'tri'
   */
  audioInCurve?: CurveType;

  /**
   * WARNING: Undocumented feature!
   */
  easing?: Easing | null;

  /**
   * WARNING: Undocumented feature!
   */
  params?: TransitionParams;
}

const randomTransitionsSet = [
  "fade",
  "fadegrayscale",
  "directionalwarp",
  "crosswarp",
  "dreamyzoom",
  "burn",
  "crosszoom",
  "simplezoom",
  "linearblur",
  "directional-left",
  "directional-right",
  "directional-up",
  "directional-down",
];

function getRandomTransition() {
  return randomTransitionsSet[Math.floor(Math.random() * randomTransitionsSet.length)];
}

const TransitionAliases: Record<string, Partial<TransitionOptions>> = {
  "directional-left": { name: "directional", easing: "easeOutExpo", params: { direction: [1, 0] } },
  "directional-right": {
    name: "directional",
    easing: "easeOutExpo",
    params: { direction: [-1, 0] },
  },
  "directional-down": { name: "directional", easing: "easeOutExpo", params: { direction: [0, 1] } },
  "directional-up": { name: "directional", easing: "easeOutExpo", params: { direction: [0, -1] } },
};

export default class Transition {
  name?: string;
  duration: number;
  params?: TransitionParams;
  easing?: Easing | null;

  constructor(options?: TransitionOptions | null, isLastClip: boolean = false) {
    if (!options || isLastClip) options = { duration: 0 };

    assert(typeof options === "object", "Transition must be an object");
    assert(
      options.duration === 0 || options.name,
      "Please specify transition name or set duration to 0",
    );

    if (options.name === "random") options.name = getRandomTransition();
    const aliasedTransition = options.name && TransitionAliases[options.name];
    if (aliasedTransition) Object.assign(options, aliasedTransition);

    this.duration = options.duration ?? 0;
    this.name = options.name;
    this.params = options.params;
    this.easing = options.easing;
  }

  get easingFunction(): EasingFunction {
    const easingFn = !!this.easing && easings[this.easing];
    return easingFn || easings.linear;
  }
}
