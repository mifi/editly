import assert from "assert";
import { compareVersions } from "compare-versions";
import { execa, type Options } from "execa";
import fsExtra from "fs-extra";
import { FfmpegConfig } from "./configuration.js";

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

const config: Required<FfmpegConfig> = {
  ffmpegPath: "ffmpeg",
  ffprobePath: "ffprobe",
  enableFfmpegLog: false,
};

export function getFfmpegCommonArgs() {
  return ["-hide_banner", ...(config.enableFfmpegLog ? [] : ["-loglevel", "error"])];
}

export function getCutFromArgs({ cutFrom }: { cutFrom?: number }) {
  return cutFrom ? ["-ss", cutFrom.toString()] : [];
}

export function getCutToArgs({
  cutTo,
  cutFrom,
  speedFactor,
}: {
  cutTo?: number;
  cutFrom?: number;
  speedFactor: number;
}) {
  return cutFrom && cutTo ? ["-t", (cutTo - cutFrom) * speedFactor] : [];
}

export async function createConcatFile(segments: string[], concatFilePath: string) {
  // https://superuser.com/questions/787064/filename-quoting-in-ffmpeg-concat
  await fsExtra.writeFile(
    concatFilePath,
    segments.map((seg) => `file '${seg.replace(/'/g, "'\\''")}'`).join("\n"),
  );
}

export async function testFf(exePath: string, name: string) {
  const minRequiredVersion = "4.3.1";

  try {
    const { stdout } = await execa(exePath, ["-version"]);
    const firstLine = stdout.split("\n")[0];
    const match = firstLine.match(`${name} version ([0-9.]+)`);
    assert(match, "Unknown version string");
    const versionStr = match[1];
    console.log(`${name} version ${versionStr}`);
    assert(compareVersions(versionStr, minRequiredVersion), "Version is outdated");
  } catch (err) {
    console.error(`WARNING: ${name}:`, err);
  }
}

export async function configureFf(params: Partial<FfmpegConfig>) {
  Object.assign(config, params);
  await testFf(config.ffmpegPath, "ffmpeg");
  await testFf(config.ffprobePath, "ffprobe");
}

export function ffmpeg(args: string[], options?: Options) {
  if (config.enableFfmpegLog) console.log(`$ ${config.ffmpegPath} ${args.join(" ")}`);
  return execa(config.ffmpegPath, [...getFfmpegCommonArgs(), ...args], options);
}

export function ffprobe(args: string[]) {
  return execa(config.ffprobePath, args);
}

export function parseFps(fps?: string) {
  const match = typeof fps === "string" && fps.match(/^([0-9]+)\/([0-9]+)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    const den = parseInt(match[2], 10);
    if (den > 0) return num / den;
  }
  return undefined;
}

export async function readDuration(p: string) {
  const { stdout } = await ffprobe([
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    p,
  ]);
  const parsed = parseFloat(stdout);
  assert(!Number.isNaN(parsed));
  return parsed;
}

export async function readFileStreams(p: string) {
  const { stdout } = await ffprobe(["-show_entries", "stream", "-of", "json", p]);
  return JSON.parse(stdout).streams as Stream[];
}

export async function readVideoFileInfo(p: string) {
  const streams = await readFileStreams(p);
  const stream = streams.find((s) => s.codec_type === "video"); // TODO

  if (!stream) {
    throw new Error(`Could not find a video stream in ${p}`);
  }

  const duration = await readDuration(p);

  let rotation = parseInt(stream.tags?.rotate ?? "", 10);

  // If we can't find rotation, try side_data_list
  if (Number.isNaN(rotation) && stream.side_data_list?.[0]?.rotation) {
    rotation = parseInt(stream.side_data_list[0].rotation, 10);
  }

  return {
    // numFrames: parseInt(stream.nb_frames, 10),
    duration,
    width: stream.width, // TODO coded_width?
    height: stream.height,
    framerateStr: stream.r_frame_rate,
    rotation: !Number.isNaN(rotation) ? rotation : undefined,
  };
}
