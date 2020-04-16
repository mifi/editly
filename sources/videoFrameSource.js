const execa = require('execa');
const assert = require('assert');

module.exports = async ({ width, height, channels, framerateStr, verbose, enableFfmpegLog, params }) => {
  const targetSize = width * height * channels;

  // TODO assert that we have read the correct amount of frames

  const { path, cutFrom, cutTo, resizeMode = 'cover', backgroundColor = '#000000', framePtsFactor } = params;

  const buf = Buffer.allocUnsafe(targetSize);
  let length = 0;
  // let inFrameCount = 0;

  let ptsFilter = '';
  if (framePtsFactor !== 1) {
    if (verbose) console.log('framePtsFactor', framePtsFactor);
    ptsFilter = `setpts=${framePtsFactor}*PTS,`;
  }

  let scaleFilter;
  if (resizeMode === 'stretch') scaleFilter = `scale=${width}:${height}`;
  // https://superuser.com/questions/891145/ffmpeg-upscale-and-letterbox-a-video/891478
  else if (resizeMode === 'contain') scaleFilter = `scale=(iw*sar)*min(${width}/(iw*sar)\\,${height}/ih):ih*min(${width}/(iw*sar)\\,${height}/ih), pad=${width}:${height}:(${width}-iw*min(${width}/iw\\,${height}/ih))/2:(${height}-ih*min(${width}/iw\\,${height}/ih))/2:${backgroundColor}`;
  // Cover: https://unix.stackexchange.com/a/192123
  else scaleFilter = `scale=(iw*sar)*max(${width}/(iw*sar)\\,${height}/ih):ih*max(${width}/(iw*sar)\\,${height}/ih),crop=${width}:${height}`;

  // http://zulko.github.io/blog/2013/09/27/read-and-write-video-frames-in-python-using-ffmpeg/
  // Testing: ffmpeg -i 'vid.mov' -t 1 -vcodec rawvideo -pix_fmt rgba -f image2pipe - | ffmpeg -f rawvideo -vcodec rawvideo -pix_fmt rgba -s 2166x1650 -i - -vf format=yuv420p -vcodec libx264 -y out.mp4
  // https://trac.ffmpeg.org/wiki/ChangingFrameRate
  const args = [
    ...(enableFfmpegLog ? [] : ['-hide_banner', '-loglevel', 'panic']),
    ...(cutFrom ? ['-ss', cutFrom] : []),
    '-i', path,
    ...(cutTo ? ['-t', (cutTo - cutFrom) * framePtsFactor] : []),
    '-vf', `${ptsFilter}fps=${framerateStr},${scaleFilter}`,
    '-map', 'v:0',
    '-vcodec', 'rawvideo',
    '-pix_fmt', 'rgba',
    '-f', 'image2pipe',
    '-',
  ];
  if (verbose) console.log(args.join(' '));

  const ps = execa('ffmpeg', args, { encoding: null, buffer: false, stdin: 'ignore', stdout: 'pipe', stderr: process.stderr });

  const stream = ps.stdout;

  let timeout;
  let ended = false;

  const readNextFrame = () => new Promise((resolve, reject) => {
    if (ended) {
      resolve();
      return;
    }
    // console.log('Reading new frame', path);

    function onEnd() {
      if (verbose) console.log(path, 'ffmpeg stream ended');
      ended = true;
      resolve();
    }

    function handleChunk(chunk) {
      // console.log('chunk', chunk.length);
      const nCopied = length + chunk.length > targetSize ? targetSize - length : chunk.length;
      chunk.copy(buf, length, 0, nCopied);
      length += nCopied;

      if (length > targetSize) console.error('OOPS! Overflow', length);

      if (length >= targetSize) {
        // console.log('Finished reading frame', inFrameCount, path);
        const out = Buffer.from(buf);

        const restLength = chunk.length - nCopied;
        if (restLength > 0) {
          if (verbose) console.log('Left over data', nCopied, chunk.length, restLength);
          chunk.slice(nCopied).copy(buf, 0);
          length = restLength;
        } else {
          length = 0;
        }

        // inFrameCount += 1;

        clearTimeout(timeout);
        stream.pause();
        stream.removeListener('data', handleChunk);
        stream.removeListener('end', onEnd);
        stream.removeListener('error', reject);
        resolve(out);
      }
    }

    timeout = setTimeout(() => {
      console.warn('Timeout on read video frame');
      stream.pause();
      stream.removeListener('data', handleChunk);
      stream.removeListener('end', onEnd);
      stream.removeListener('error', reject);
      resolve();
    }, 10000);

    stream.on('data', handleChunk);
    stream.on('end', onEnd);
    stream.on('error', reject);
    stream.resume();
  }).then((data) => {
    if (data) assert(data.length === targetSize);
    return data;
  });

  const close = () => {
    console.log('Close', path);
    ps.cancel();
  };

  return {
    readNextFrame,
    close,
  };
};
