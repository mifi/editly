const execa = require('execa');
const assert = require('assert');

const { getFfmpegCommonArgs } = require('../ffmpeg');
const { readFileStreams } = require('../util');

module.exports = async ({ statelessMode, width, height, channels, framerateStr, verbose, ffmpegPath, ffprobePath, enableFfmpegLog, params }) => {
  const targetSize = width * height * channels;

  const buf = Buffer.allocUnsafe(targetSize);

  // TODO assert that we have read the correct amount of frames

  const { path, cutFrom, cutTo, resizeMode = 'cover', backgroundColor = '#000000', framePtsFactor, inputDuration } = params;

  let initializing;

  let stream;
  let ps;
  let length;

  let timeout;
  let ended;

  async function restartProcess(cutFromWithProgress) {
    console.log('(Re)start process', { cutFromWithProgress });

    if (initializing) throw new Error('Already initializing video');
    initializing = true;

    stream = undefined;
    if (ps) ps.cancel();
    ps = undefined;
    length = 0;
    clearTimeout(timeout);
    timeout = undefined;
    ended = false;

    // let inFrameCount = 0;

    let ptsFilter = '';
    if (framePtsFactor !== 1) {
      if (verbose) console.log('framePtsFactor', framePtsFactor);
      ptsFilter = `setpts=${framePtsFactor}*PTS,`;
    }

    let scaleFilter;
    if (resizeMode === 'stretch') scaleFilter = `scale=${width}:${height}`;
    // https://superuser.com/questions/891145/ffmpeg-upscale-and-letterbox-a-video/891478
    else if (resizeMode === 'contain' || resizeMode === 'contain-blur') scaleFilter = `scale=(iw*sar)*min(${width}/(iw*sar)\\,${height}/ih):ih*min(${width}/(iw*sar)\\,${height}/ih), pad=${width}:${height}:(${width}-iw*min(${width}/iw\\,${height}/ih))/2:(${height}-ih*min(${width}/iw\\,${height}/ih))/2:${backgroundColor}`;
    // Cover: https://unix.stackexchange.com/a/192123
    else scaleFilter = `scale=(iw*sar)*max(${width}/(iw*sar)\\,${height}/ih):ih*max(${width}/(iw*sar)\\,${height}/ih),crop=${width}:${height}`;

    // https://forum.unity.com/threads/settings-for-importing-a-video-with-an-alpha-channel.457657/
    const streams = await readFileStreams(ffprobePath, path);
    const firstVideoStream = streams.find((s) => s.codec_type === 'video');
    // https://superuser.com/a/1116905/658247
    const inputCodecArgs = ['vp8', 'vp9'].includes(firstVideoStream.codec_name) ? ['-vcodec', 'libvpx'] : [];

    // http://zulko.github.io/blog/2013/09/27/read-and-write-video-frames-in-python-using-ffmpeg/
    // Testing: ffmpeg -i 'vid.mov' -t 1 -vcodec rawvideo -pix_fmt rgba -f image2pipe - | ffmpeg -f rawvideo -vcodec rawvideo -pix_fmt rgba -s 2166x1650 -i - -vf format=yuv420p -vcodec libx264 -y out.mp4
    // https://trac.ffmpeg.org/wiki/ChangingFrameRate
    const args = [
      ...getFfmpegCommonArgs({ enableFfmpegLog }),
      ...inputCodecArgs,
      ...(cutFromWithProgress ? ['-ss', cutFromWithProgress] : []),
      '-i', path,
      // TODO -t maybe not needed as we will close the stream when we don't need more?
      // ...(cutTo ? ['-t', (cutTo - cutFrom) * framePtsFactor] : []),
      ...(statelessMode ? ['-vframes', '1'] : []),
      '-vf', `${ptsFilter}fps=${framerateStr},${scaleFilter}`,
      '-map', 'v:0',
      '-vcodec', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-f', 'image2pipe',
      '-',
    ];
    if (verbose) console.log(args.join(' '));

    ps = execa(ffmpegPath, args, { encoding: null, buffer: false, stdin: 'ignore', stdout: 'pipe', stderr: process.stderr });

    stream = ps.stdout;

    stream.once('end', () => {
      clearTimeout(timeout);
      if (verbose) console.log(path, 'ffmpeg video stream ended');
      ended = true;
    });

    initializing = false; // TODO try finally
  }

  // await restartProcess();

  const renderFrame = async (progress) => {
    // console.log(progress)
    if (statelessMode || progress === 0) {
      const cutFromWithProgress = (cutFrom || 0) + (progress * inputDuration);
      await restartProcess(cutFromWithProgress);
    }

    const data = await new Promise((resolve, reject) => {
      if (ended) {
        console.log(path, 'Tried to read next video frame after ffmpeg video stream ended');
        resolve();
        return;
      }
      // console.log('Reading new frame', path);

      function onEnd() {
        resolve();
      }

      function cleanup() {
        stream.pause();
        // eslint-disable-next-line no-use-before-define
        stream.removeListener('data', handleChunk);
        stream.removeListener('end', onEnd);
        stream.removeListener('error', reject);
      }

      function handleChunk(chunk) {
        // console.log('chunk', chunk.length);
        const nCopied = length + chunk.length > targetSize ? targetSize - length : chunk.length;
        chunk.copy(buf, length, 0, nCopied);
        length += nCopied;

        if (length > targetSize) console.error('Video data overflow', length);

        if (length >= targetSize) {
          // console.log('Finished reading frame', inFrameCount, path);
          const out = Buffer.from(buf);

          const restLength = chunk.length - nCopied;
          if (restLength > 0) {
            // if (verbose) console.log('Left over data', nCopied, chunk.length, restLength);
            chunk.slice(nCopied).copy(buf, 0);
            length = restLength;
          } else {
            length = 0;
          }

          // inFrameCount += 1;

          clearTimeout(timeout);
          cleanup();
          resolve(out);
        }
      }

      timeout = setTimeout(() => {
        console.warn('Timeout on read video frame');
        cleanup();
        resolve();
      }, 60000);

      stream.on('data', handleChunk);
      stream.on('end', onEnd);
      stream.on('error', reject);
      stream.resume();
    });

    if (data) assert.equal(data.length, targetSize);
    return data;
  };

  const close = () => {
    if (verbose) console.log('Close', path);
    ps.cancel();
  };

  return {
    renderFrame,
    close,
  };
};
