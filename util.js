const execa = require('execa');
const assert = require('assert');

function parseFps(fps) {
  const match = typeof fps === 'string' && fps.match(/^([0-9]+)\/([0-9]+)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    const den = parseInt(match[2], 10);
    if (den > 0) return num / den;
  }
  return undefined;
}

async function readDuration(ffprobePath, p) {
  const { stdout } = await execa(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', p]);
  const parsed = parseFloat(stdout);
  assert(!Number.isNaN(parsed));
  return parsed;
}

async function readFileStreams(ffprobePath, p) {
  const { stdout } = await execa(ffprobePath, [
    '-show_entries', 'stream', '-of', 'json', p,
  ]);
  const json = JSON.parse(stdout);
  return json.streams;
}

async function readVideoFileInfo(ffprobePath, p) {
  const streams = await readFileStreams(ffprobePath, p);
  const stream = streams.find((s) => s.codec_type === 'video'); // TODO

  const duration = await readDuration(ffprobePath, p);

  const rotation = stream.tags && stream.tags.rotate && parseInt(stream.tags.rotate, 10);
  return {
    // numFrames: parseInt(stream.nb_frames, 10),
    duration,
    width: stream.width, // TODO coded_width?
    height: stream.height,
    framerateStr: stream.r_frame_rate,
    rotation: !Number.isNaN(rotation) ? rotation : undefined,
  };
}

async function readAudioFileInfo(ffprobePath, p) {
  const duration = await readDuration(ffprobePath, p);

  return { duration };
}

function toArrayInteger(buffer) {
  if (buffer.length > 0) {
    const data = new Uint8ClampedArray(buffer.length);
    for (let i = 0; i < buffer.length; i += 1) {
      data[i] = buffer[i];
    }
    return data;
  }
  return [];
}

const multipleOf2 = (x) => (x + (x % 2));

function getPositionProps({ position, width, height }) {
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

module.exports = {
  parseFps,
  readVideoFileInfo,
  readAudioFileInfo,
  multipleOf2,
  toArrayInteger,
  readFileStreams,
  getPositionProps,
};
