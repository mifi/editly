import { flatMap } from "lodash-es";
import pMap from "p-map";
import { basename, join, resolve } from "path";
import type { Configuration } from "./configuration.js";
import { ffmpeg, getCutFromArgs, readFileStreams } from "./ffmpeg.js";
import type { TransitionOptions } from "./transition.js";
import type {
  AudioLayer,
  AudioNormalizationOptions,
  AudioTrack,
  Clip,
  VideoLayer,
} from "./types.js";

export type AudioOptions = {
  verbose: boolean;
  tmpDir: string;
};

export type EditAudioOptions = Pick<
  Configuration,
  "keepSourceAudio" | "clips" | "clipsAudioVolume" | "audioNorm" | "outputVolume"
> & {
  arbitraryAudio: AudioTrack[];
};

type LayerWithAudio = (AudioLayer | VideoLayer) & { speedFactor: number };

export default ({ verbose, tmpDir }: AudioOptions) => {
  async function createMixedAudioClips({
    clips,
    keepSourceAudio,
  }: {
    clips: Clip[];
    keepSourceAudio?: boolean;
  }) {
    return pMap(
      clips,
      async (clip, i) => {
        const { duration, layers, transition } = clip;

        async function runInner(): Promise<{ clipAudioPath: string; silent: boolean }> {
          const clipAudioPath = join(tmpDir, `clip${i}-audio.flac`);

          async function createSilence() {
            if (verbose) console.log("create silence", duration);
            const args = [
              "-nostdin",
              "-f",
              "lavfi",
              "-i",
              "anullsrc=channel_layout=stereo:sample_rate=44100",
              "-sample_fmt",
              "s32",
              "-ar",
              "48000",
              "-t",
              duration!.toString(),
              "-c:a",
              "flac",
              "-y",
              clipAudioPath,
            ];
            await ffmpeg(args);

            return { silent: true, clipAudioPath };
          }

          // Has user enabled keep source audio?
          if (!keepSourceAudio) return createSilence();

          // TODO:[ts]: Layers is always an array once config is parsed. Fix this in types
          const audioLayers = layers.filter(
            ({ type, start, stop }) =>
              ["audio", "video"].includes(type) &&
              // TODO: We don't support audio for start/stop layers
              !start &&
              stop == null,
          ) as LayerWithAudio[];

          if (audioLayers.length === 0) return createSilence();

          const processedAudioLayersRaw = await pMap(
            audioLayers,
            async (audioLayer, j) => {
              const { path, cutFrom, cutTo, speedFactor } = audioLayer;

              const streams = await readFileStreams(path);
              if (!streams.some((s) => s.codec_type === "audio")) return undefined;

              const layerAudioPath = join(tmpDir, `clip${i}-layer${j}-audio.flac`);

              try {
                let atempoFilter;
                if (Math.abs(speedFactor - 1) > 0.01) {
                  if (verbose) console.log("audio speedFactor", speedFactor);
                  const atempo = 1 / speedFactor;
                  if (!(atempo >= 0.5 && atempo <= 100)) {
                    // Required range by ffmpeg
                    console.warn(
                      `Audio speed ${atempo} is outside accepted range, using silence (clip ${i})`,
                    );
                    return undefined;
                  }
                  atempoFilter = `atempo=${atempo}`;
                }

                const cutToArg = (cutTo! - cutFrom!) * speedFactor;

                const args = [
                  "-nostdin",
                  ...getCutFromArgs({ cutFrom }),
                  "-i",
                  path,
                  "-t",
                  cutToArg!.toString(),
                  "-sample_fmt",
                  "s32",
                  "-ar",
                  "48000",
                  "-map",
                  "a:0",
                  "-c:a",
                  "flac",
                  ...(atempoFilter ? ["-filter:a", atempoFilter] : []),
                  "-y",
                  layerAudioPath,
                ];

                await ffmpeg(args);

                return [layerAudioPath, audioLayer];
              } catch (err) {
                if (verbose) console.error("Cannot extract audio from video", path, err);
                // Fall back to silence
                return undefined;
              }
            },
            { concurrency: 4 },
          );

          const processedAudioLayers = processedAudioLayersRaw.filter(
            (r): r is [string, LayerWithAudio] => r !== undefined,
          );

          if (processedAudioLayers.length < 1) return createSilence();

          if (processedAudioLayers.length === 1)
            return { clipAudioPath: processedAudioLayers[0][0], silent: false };

          // Merge/mix all layers' audio
          const weights = processedAudioLayers.map(([, { mixVolume }]) => mixVolume ?? 1);
          const args = [
            "-nostdin",
            ...flatMap(processedAudioLayers, ([layerAudioPath]) => ["-i", layerAudioPath]),
            "-filter_complex",
            `amix=inputs=${processedAudioLayers.length}:duration=longest:weights=${weights.join(" ")}`,
            "-c:a",
            "flac",
            "-y",
            clipAudioPath,
          ];

          await ffmpeg(args);
          return { clipAudioPath, silent: false };
        }

        const { clipAudioPath, silent } = await runInner();

        return {
          path: resolve(clipAudioPath), // https://superuser.com/a/853262/658247
          transition,
          silent,
        };
      },
      { concurrency: 4 },
    );
  }

  async function crossFadeConcatClipAudio(
    clipAudio: { path: string; transition?: TransitionOptions | null }[],
  ) {
    if (clipAudio.length < 2) {
      return clipAudio[0].path;
    }

    const outPath = join(tmpDir, "audio-concat.flac");

    if (verbose)
      console.log(
        "Combining audio",
        clipAudio.map(({ path }) => basename(path)),
      );

    let inStream = "[0:a]";
    const filterGraph = clipAudio
      .slice(0, -1)
      .map(({ transition }, i) => {
        const outStream = `[concat${i}]`;

        const epsilon = 0.0001; // If duration is 0, ffmpeg seems to default to 1 sec instead, hence epsilon.
        let ret = `${inStream}[${i + 1}:a]acrossfade=d=${Math.max(epsilon, transition?.duration ?? 0)}:c1=${transition?.audioOutCurve ?? "tri"}:c2=${transition?.audioInCurve ?? "tri"}`;

        inStream = outStream;

        if (i < clipAudio.length - 2) ret += outStream;
        return ret;
      })
      .join(",");

    const args = [
      "-nostdin",
      ...flatMap(clipAudio, ({ path }) => ["-i", path]),
      "-filter_complex",
      filterGraph,
      "-c",
      "flac",
      "-y",
      outPath,
    ];
    await ffmpeg(args);

    return outPath;
  }

  // FIXME[ts]: parseConfig sets `loop` on arbitrary audio tracks. Should that be part of the `AudioTrack` interface?
  async function mixArbitraryAudio({
    streams,
    audioNorm,
    outputVolume,
  }: {
    streams: (AudioTrack & { loop?: number })[];
    audioNorm?: AudioNormalizationOptions;
    outputVolume?: number | string;
  }) {
    let maxGain = 30;
    let gaussSize = 5;
    if (audioNorm) {
      if (audioNorm.gaussSize != null) gaussSize = audioNorm.gaussSize;
      if (audioNorm.maxGain != null) maxGain = audioNorm.maxGain;
    }
    const enableAudioNorm = audioNorm && audioNorm.enable;

    // https://stackoverflow.com/questions/35509147/ffmpeg-amix-filter-volume-issue-with-inputs-of-different-duration
    let filterComplex = streams
      .map(({ start, cutFrom, cutTo }, i) => {
        const cutToArg = cutTo != null ? `:end=${cutTo}` : "";
        const apadArg = i > 0 ? ",apad" : ""; // Don't pad the first track (audio from video clips with correct duration)

        return `[${i}:a]atrim=start=${cutFrom || 0}${cutToArg},adelay=delays=${Math.floor((start || 0) * 1000)}:all=1${apadArg}[a${i}]`;
      })
      .join(";");

    const volumeArg = outputVolume != null ? `,volume=${outputVolume}` : "";
    const audioNormArg = enableAudioNorm ? `,dynaudnorm=g=${gaussSize}:maxgain=${maxGain}` : "";
    filterComplex += `;${streams.map((_, i) => `[a${i}]`).join("")}amix=inputs=${streams.length}:duration=first:dropout_transition=0:weights=${streams.map((s) => (s.mixVolume != null ? s.mixVolume : 1)).join(" ")}${audioNormArg}${volumeArg}`;

    const mixedAudioPath = join(tmpDir, "audio-mixed.flac");

    const args = [
      "-nostdin",
      ...flatMap(streams, ({ path, loop }) => ["-stream_loop", (loop || 0).toString(), "-i", path]),
      "-vn",
      "-filter_complex",
      filterComplex,
      "-c:a",
      "flac",
      "-y",
      mixedAudioPath,
    ];

    await ffmpeg(args);

    return mixedAudioPath;
  }

  async function editAudio({
    keepSourceAudio,
    clips,
    arbitraryAudio,
    clipsAudioVolume,
    audioNorm,
    outputVolume,
  }: EditAudioOptions) {
    // We need clips to process audio, because we need to know duration
    if (clips.length === 0) return undefined;

    // No need to process audio if none of these are satisfied
    if (!(keepSourceAudio || arbitraryAudio.length > 0)) return undefined;

    console.log("Extracting audio/silence from all clips");

    // Mix audio from each clip as separate files (or silent audio of appropriate length for clips with no audio)
    const clipAudio = await createMixedAudioClips({ clips, keepSourceAudio });

    // Return no audio if only silent clips and no arbitrary audio
    if (clipAudio.every((ca) => ca.silent) && arbitraryAudio.length === 0) return undefined;

    // Merge & fade the clip audio files
    const concatedClipAudioPath = await crossFadeConcatClipAudio(clipAudio);

    const streams: AudioTrack[] = [
      // The first stream is required, as it determines the length of the output audio.
      // All other streams will be truncated to its length
      { path: concatedClipAudioPath, mixVolume: clipsAudioVolume },

      ...arbitraryAudio,
    ];

    console.log("Mixing clip audio with arbitrary audio");

    if (streams.length < 2) return concatedClipAudioPath;

    const mixedFile = await mixArbitraryAudio({ streams, audioNorm, outputVolume });
    return mixedFile;
  }

  return {
    editAudio,
  };
};
