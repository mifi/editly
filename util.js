import { execa } from 'execa';
import assert from 'assert';
import sortBy from 'lodash-es/sortBy.js';
import fsExtra from 'fs-extra';

export function parseFps(fps) {
  const match = typeof fps === 'string' && fps.match(/^([0-9]+)\/([0-9]+)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    const den = parseInt(match[2], 10);
    if (den > 0) return num / den;
  }
  return undefined;
}

export async function readDuration(ffprobePath, p) {
  const { stdout } = await execa(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', p]);
  const parsed = parseFloat(stdout);
  assert(!Number.isNaN(parsed));
  return parsed;
}

export async function readFileStreams(ffprobePath, p) {
  const { stdout } = await execa(ffprobePath, [
    '-show_entries', 'stream', '-of', 'json', p,
  ]);
  const json = JSON.parse(stdout);
  return json.streams;
}

export async function readVideoFileInfo(ffprobePath, p) {
  const streams = await readFileStreams(ffprobePath, p);
  const stream = streams.find((s) => s.codec_type === 'video'); // TODO

  const duration = await readDuration(ffprobePath, p);

  let rotation = parseInt(stream.tags && stream.tags.rotate, 10);

  // If we can't find rotation, try side_data_list
  if (Number.isNaN(rotation) && Array.isArray(stream.side_data_list) && stream.side_data_list[0] && stream.side_data_list[0].rotation) {
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

export async function readAudioFileInfo(ffprobePath, p) {
  const duration = await readDuration(ffprobePath, p);

  return { duration };
}

export function toArrayInteger(buffer) {
  if (buffer.length > 0) {
    const data = new Uint8ClampedArray(buffer.length);
    for (let i = 0; i < buffer.length; i += 1) {
      data[i] = buffer[i];
    }
    return data;
  }
  return [];
}

// x264 requires multiple of 2
export const multipleOf2 = (x) => Math.round(x / 2) * 2;

export function getPositionProps({ position, width, height }) {
  let originY = 'center';
  let originX = 'center';
  let top = height / 2;
  let left = width / 2;

  const margin = 0.05;
  if (position === 'top') {
    originY = 'top';
    top = height * margin;
  } else if (position === 'bottom') {
    originY = 'bottom';
    top = height * (1 - margin);
  } else if (position === 'center') {
    originY = 'center';
    top = height / 2;
  } else if (position === 'top-left') {
    originX = 'left';
    originY = 'top';
    left = width * margin;
    top = height * margin;
  } else if (position === 'top-right') {
    originX = 'right';
    originY = 'top';
    left = width * (1 - margin);
    top = height * margin;
  } else if (position === 'center-left') {
    originX = 'left';
    originY = 'center';
    left = width * margin;
    top = height / 2;
  } else if (position === 'center-right') {
    originX = 'right';
    originY = 'center';
    left = width * (1 - margin);
    top = height / 2;
  } else if (position === 'bottom-left') {
    originX = 'left';
    originY = 'bottom';
    left = width * margin;
    top = height * (1 - margin);
  } else if (position === 'bottom-right') {
    originX = 'right';
    originY = 'bottom';
    left = width * (1 - margin);
    top = height * (1 - margin);
  }

  if (position && position.x != null) {
    originX = position.originX || 'left';
    left = width * position.x;
  }
  if (position && position.y != null) {
    originY = position.originY || 'top';
    top = height * position.y;
  }

  return { originX, originY, top, left };
}

export function getFrameByKeyFrames(keyframes, progress) {
  if (keyframes.length < 2) throw new Error('Keyframes must be at least 2');
  const sortedKeyframes = sortBy(keyframes, 't');

  // TODO check that max is 1
  // TODO check that all keyframes have all props
  // TODO make smarter so user doesn't need to replicate non-changing props

  const invalidKeyframe = sortedKeyframes.find((k, i) => {
    if (i === 0) return false;
    return k.t === sortedKeyframes[i - 1].t;
  });
  if (invalidKeyframe) throw new Error('Invalid keyframe');

  let prevKeyframe = [...sortedKeyframes].reverse().find((k) => k.t < progress);
  // eslint-disable-next-line prefer-destructuring
  if (!prevKeyframe) prevKeyframe = sortedKeyframes[0];

  let nextKeyframe = sortedKeyframes.find((k) => k.t >= progress);
  if (!nextKeyframe) nextKeyframe = sortedKeyframes[sortedKeyframes.length - 1];

  if (nextKeyframe.t === prevKeyframe.t) return prevKeyframe.props;

  const interProgress = (progress - prevKeyframe.t) / (nextKeyframe.t - prevKeyframe.t);
  return Object.fromEntries(Object.entries(prevKeyframe.props).map(([propName, prevVal]) => ([propName, prevVal + ((nextKeyframe.props[propName] - prevVal) * interProgress)])));
}

export const isUrl = (path) => /^https?:\/\//.test(path);

export const assertFileValid = async (path, allowRemoteRequests) => {
  if (isUrl(path)) {
    assert(allowRemoteRequests, 'Remote requests are not allowed');
    return;
  }
  assert(await fsExtra.pathExists(path), `File does not exist ${path}`);
};

// See #16
export const checkTransition = (transition) => assert(transition == null || typeof transition === 'object', 'Transition must be an object');
