// Types used internally and not exposed through any external interfaces.
// TODO[ts]: Move these elsewhere

export type Stream = {
  codec_type: string;
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
