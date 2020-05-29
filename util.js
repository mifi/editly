const execa = require('execa');

function toArrayInteger(buffer) {
  if (buffer.length > 0) {
      const data = new Uint8ClampedArray(buffer.length);
      for (let i = 0; i < buffer.length; i=i+1)
          data[i] = buffer[i];
      return data;
  }
  return [];
}

function parseFps(fps) {
  const match = typeof fps === 'string' && fps.match(/^([0-9]+)\/([0-9]+)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    const den = parseInt(match[2], 10);
    if (den > 0) return num / den;
  }
  return undefined;
}

async function readFileInfo(ffprobePath, p) {
  const { stdout } = await execa(ffprobePath, [
    '-select_streams', 'v:0', '-show_entries', 'stream', '-of', 'json', p,
  ]);
  const json = JSON.parse(stdout);
  const stream = json.streams[0];

  const rotation = stream.tags && stream.tags.rotate && parseInt(stream.tags.rotate, 10);
  return {
    // numFrames: parseInt(stream.nb_frames, 10),
    duration: parseFloat(stream.duration, 10),
    width: stream.width, // TODO coded_width?
    height: stream.height,
    framerateStr: stream.r_frame_rate,
    rotation: !Number.isNaN(rotation) ? rotation : undefined,
  };
}

const multipleOf2 = (x) => (x + (x % 2));

module.exports = {
  parseFps,
  readFileInfo,
  multipleOf2,
  toArrayInteger
};
