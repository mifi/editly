// Types used internally and not exposed through any external interfaces.
// TODO[ts]: Move these elsewhere

import { Layer, VideoLayer } from "./index.js";

export type Stream = {
  codec_type: string;
  codec_name: string;
  r_frame_rate: string;
  width?: number;
  height?: number;
  tags?: {
    rotate: string;
  };
  side_data_list?: {
    rotation: string;
  }[];
};

export type Keyframe = {
  t: number;
  props: Record<string, any>;
};

export type CreateFrameSourceOptions<T> = {
  ffmpegPath: string;
  ffprobePath: string;
  width: number,
  height: number,
  duration: number,
  channels: number,
  verbose: boolean,
  logTimes: boolean,
  enableFfmpegLog: boolean,
  framerateStr: string,
  params: T,
};

export type LayerDuration<T> = T & {
  layerDuration: number;
};

export type ProcessedLayer = LayerDuration<Exclude<Layer, { type: "video" }>> | ProcessedVideoLayer;

export type ProcessedVideoLayer = LayerDuration<VideoLayer> & {
  framerateStr: string;
  inputWidth: number;
  inputHeight: number;
  speedFactor: number;
};
