import { CreateFrameSourceOptions, FrameSource } from "../types.js";

type DefineFrameSource<T> = (fn: CreateFrameSourceOptions<T>) => Promise<FrameSource>;

/**
 * A minimal API for creating new frame sources. Currently only provides typing.
 */
export function defineFrameSource<T>(fn: DefineFrameSource<T>) {
  return fn;
}
