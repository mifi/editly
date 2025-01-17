import type { BaseLayer, DebugOptions, OptionalPromise } from "../types.js";
import type { StaticCanvas } from "fabric/node";

/**
 * A public API for defining new frame sources.
 */
export function defineFrameSource<T extends BaseLayer>(type: T["type"], setup: FrameSourceSetupFunction<T>): FrameSourceFactory<T> {
  return {
    type,
    async setup(options: CreateFrameSourceOptions<T>) {
      return new FrameSource<T>(options, await setup(options));
    }
  }
}

export type CreateFrameSourceOptions<T> = DebugOptions & {
  width: number,
  height: number,
  duration: number,
  channels: number,
  framerateStr: string,
  params: T,
};

export interface FrameSourceFactory<T extends BaseLayer> {
  type: T["type"];
  setup: (fn: CreateFrameSourceOptions<T>) => Promise<FrameSource<T>>;
}

export interface FrameSourceSetupReturn {
  readNextFrame(progress: number, canvas: StaticCanvas, offsetTime: number): OptionalPromise<Buffer | void>;
  close?(): OptionalPromise<void | undefined>;
}

export type FrameSourceSetupFunction<T> = (fn: CreateFrameSourceOptions<T>) => Promise<FrameSourceSetupReturn>;

export class FrameSource<T> {
  options: CreateFrameSourceOptions<T>;
  readNextFrame: FrameSourceSetupReturn["readNextFrame"];
  close?: FrameSourceSetupReturn["close"];

  constructor(options: CreateFrameSourceOptions<T>, impl: FrameSourceSetupReturn) {
    this.options = options;
    this.readNextFrame = impl.readNextFrame;
    this.close = impl.close;
  }

  get layer() {
    return this.options.params;
  }
}
