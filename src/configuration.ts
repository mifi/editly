import assert from "assert";
import { merge } from "lodash-es";
import { nanoid } from "nanoid";
import { dirname, join } from "path";
import { expandLayerAliases } from "./sources/index.js";
import type { AudioNormalizationOptions, AudioTrack, Clip, DefaultOptions } from "./types.js";

export type DebugOptions = {
  verbose?: boolean;
  logTimes?: boolean;
};

export type FfmpegConfig = {
  ffmpegPath?: string;
  ffprobePath?: string;
  enableFfmpegLog?: boolean;
};

export type ConfigurationOptions = {
  /**
   * Output path (`.mp4` or `.mkv`, can also be a `.gif`).
   */
  outPath: string;

  /**
   * List of clip objects that will be played in sequence.
   * Each clip can have one or more layers.
   *
   * @default []
   */
  clips: Clip[];

  /**
   * Width which all media will be converted to.
   *
   * @default 640
   */
  width?: number;

  /**
   * Height which all media will be converted to.
   * Decides height based on `width` and aspect ratio of the first video by default.
   */
  height?: number;

  /**
   * FPS which all videos will be converted to.
   * Defaults to first video's FPS or `25`.
   */
  fps?: number;

  /**
   * Specify custom output codec/format arguments for ffmpeg.
   * Automatically adds codec options (normally `h264`) by default.
   *
   * @see [Example]{@link https://github.com/mifi/editly/blob/master/examples/customOutputArgs.json5}
   */
  customOutputArgs?: string[];

  /**
   * Allow remote URLs as paths.
   *
   * @default false
   */
  allowRemoteRequests?: boolean;

  /**
   * Fast mode (low resolution and FPS, useful for getting a quick preview ⏩).
   *
   * @default false
   */
  fast?: boolean;

  /**
   * An object describing default options for clips and layers.
   */
  defaults?: DefaultOptions;

  /**
   * List of arbitrary audio tracks.
   *
   * @default []
   * @see [Audio tracks]{@link https://github.com/mifi/editly#arbitrary-audio-tracks}
   */
  audioTracks?: AudioTrack[];

  /**
   * Set an audio track for the whole video..
   *
   * @see [Audio tracks]{@link https://github.com/mifi/editly#arbitrary-audio-tracks}
   */
  audioFilePath?: string;

  /**
   * Background Volume
   *
   * @see [Audio tracks]{@link https://github.com/mifi/editly#arbitrary-audio-tracks}
   */
  backgroundAudioVolume?: string | number;

  /**
   * Loop the audio track if it is shorter than video?
   *
   * @default false
   */
  loopAudio?: boolean;

  /**
   * Keep source audio from `clips`?
   *
   * @default false
   */
  keepSourceAudio?: boolean;

  /**
   * Volume of audio from `clips` relative to `audioTracks`.
   *
   * @default 1
   * @see [Audio tracks]{@link https://github.com/mifi/editly#arbitrary-audio-tracks}
   */
  clipsAudioVolume?: number | string;

  /**
   * Adjust output [volume]{@link http://ffmpeg.org/ffmpeg-filters.html#volume} (final stage).
   *
   * @default 1
   * @see [Example]{@link https://github.com/mifi/editly/blob/master/examples/audio-volume.json5}
   * @example
   * 0.5
   * @example
   * '10db'
   */
  outputVolume?: number | string;

  /**
   * Audio normalization.
   */
  audioNorm?: AudioNormalizationOptions;

  /**
   * WARNING: Undocumented feature!
   */
  keepTmp?: boolean;
} & DebugOptions &
  FfmpegConfig;

export type LayerSourceConfig = Pick<
  Configuration,
  "verbose" | "allowRemoteRequests" | "logTimes" | "tmpDir"
>;

const globalDefaults = {
  duration: 4,
  transition: {
    duration: 0.5,
    name: "random",
    audioOutCurve: "tri",
    audioInCurve: "tri",
  },
};

export class Configuration {
  clips: Clip[];
  outPath: string;
  tmpDir: string;
  allowRemoteRequests: boolean;
  customOutputArgs?: string[];
  defaults: DefaultOptions;

  // Video
  width?: number;
  height?: number;
  fps?: number;

  // Audio
  audioFilePath?: string;
  backgroundAudioVolume?: string | number;
  loopAudio?: boolean;
  keepSourceAudio?: boolean;
  audioNorm?: AudioNormalizationOptions;
  outputVolume?: number | string;
  clipsAudioVolume: string | number;
  audioTracks: AudioTrack[];

  // Debug
  enableFfmpegLog: boolean;
  verbose: boolean;
  logTimes: boolean;
  keepTmp: boolean;
  fast: boolean;
  ffmpegPath: string;
  ffprobePath: string;

  constructor(input: ConfigurationOptions) {
    assert(input.outPath, "Please provide an output path");
    assert(Array.isArray(input.clips) && input.clips.length > 0, "Please provide at least 1 clip");
    assert(
      !input.customOutputArgs || Array.isArray(input.customOutputArgs),
      "customOutputArgs must be an array of arguments",
    );

    this.outPath = input.outPath;
    this.width = input.width;
    this.height = input.height;
    this.fps = input.fps;
    this.audioFilePath = input.audioFilePath;
    this.backgroundAudioVolume = input.backgroundAudioVolume;
    this.loopAudio = input.loopAudio;
    this.clipsAudioVolume = input.clipsAudioVolume ?? 1;
    this.audioTracks = input.audioTracks ?? [];
    this.keepSourceAudio = input.keepSourceAudio;
    this.allowRemoteRequests = input.allowRemoteRequests ?? false;
    this.audioNorm = input.audioNorm;
    this.outputVolume = input.outputVolume;
    this.customOutputArgs = input.customOutputArgs;
    this.defaults = merge({}, globalDefaults, input.defaults);

    this.clips = input.clips.map((clip) => {
      let { layers } = clip;

      if (layers && !Array.isArray(layers)) layers = [layers]; // Allow single layer for convenience
      assert(
        Array.isArray(layers) && layers.length > 0,
        "clip.layers must be an array with at least one layer.",
      );

      layers = layers
        .map(expandLayerAliases)
        .flat()
        .map((layer) => {
          assert(layer.type, 'All "layers" must have a type');
          return merge(
            {},
            this.defaults.layer ?? {},
            this.defaults.layerType?.[layer.type] ?? {},
            layer,
          );
        });

      const { transition } = merge({}, this.defaults, clip);
      assert(transition == null || typeof transition === "object", "Transition must be an object");

      return { transition, layers, duration: clip.duration };
    });

    // Testing options:
    this.verbose = input.verbose ?? false;
    this.enableFfmpegLog = input.enableFfmpegLog ?? this.verbose;
    this.logTimes = input.logTimes ?? false;
    this.keepTmp = input.keepTmp ?? false;
    this.fast = input.fast ?? false;

    this.ffmpegPath = input.ffmpegPath ?? "ffmpeg";
    this.ffprobePath = input.ffprobePath ?? "ffprobe";

    this.tmpDir = join(this.outDir, `editly-tmp-${nanoid()}`);
  }

  get outDir() {
    return dirname(this.outPath);
  }

  get isGif() {
    return this.outPath.toLowerCase().endsWith(".gif");
  }
}
