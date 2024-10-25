import { execa } from 'execa';
import assert from 'assert';
import { fabric } from 'fabric';

import { getFfmpegCommonArgs } from '../ffmpeg.js';
import { readFileStreams } from '../util.js';
import {
  rgbaToFabricImage,
  blurImage,
} from './fabric.js';

export default async ({ width: canvasWidth, height: canvasHeight, channels, framerateStr, verbose, logTimes, ffmpegPath, ffprobePath, enableFfmpegLog, params }) => {
  const { path, cutFrom, cutTo, resizeMode = 'contain-blur', speedFactor, inputWidth, inputHeight, width: requestedWidthRel, height: requestedHeightRel, left: leftRel = 0, top: topRel = 0, originX = 'left', originY = 'top', fabricImagePostProcessing = null } = params;

  const requestedWidth = requestedWidthRel ? Math.round(requestedWidthRel * canvasWidth) : canvasWidth;
  const requestedHeight = requestedHeightRel ? Math.round(requestedHeightRel * canvasHeight) : canvasHeight;

  const left = leftRel * canvasWidth;
  const top = topRel * canvasHeight;

  const ratioW = requestedWidth / inputWidth;
  const ratioH = requestedHeight / inputHeight;
  const inputAspectRatio = inputWidth / inputHeight;

  let targetWidth = requestedWidth;
  let targetHeight = requestedHeight;

  let scaleFilter;
  if (['contain', 'contain-blur'].includes(resizeMode)) {
    if (ratioW > ratioH) {
      targetHeight = requestedHeight;
      targetWidth = Math.round(requestedHeight * inputAspectRatio);
    } else {
      targetWidth = requestedWidth;
      targetHeight = Math.round(requestedWidth / inputAspectRatio);
    }

    scaleFilter = `scale=${targetWidth}:${targetHeight}`;
  } else if (resizeMode === 'cover') {
    let scaledWidth;
    let scaledHeight;

    if (ratioW > ratioH) {
      scaledWidth = requestedWidth;
      scaledHeight = Math.round(requestedWidth / inputAspectRatio);
    } else {
      scaledHeight = requestedHeight;
      scaledWidth = Math.round(requestedHeight * inputAspectRatio);
    }

    // TODO improve performance by crop first, then scale?
    scaleFilter = `scale=${scaledWidth}:${scaledHeight},crop=${targetWidth}:${targetHeight}`;
  } else { // 'stretch'
    scaleFilter = `scale=${targetWidth}:${targetHeight}`;
  }

  if (verbose) console.log(scaleFilter);

  let ptsFilter = '';
  if (speedFactor !== 1) {
    if (verbose) console.log('speedFactor', speedFactor);
    ptsFilter = `setpts=${speedFactor}*PTS,`;
  }

  const frameByteSize = targetWidth * targetHeight * channels;

  // TODO assert that we have read the correct amount of frames

  let buf = Buffer.allocUnsafe(frameByteSize);
  const frameBuffer = Buffer.allocUnsafe(frameByteSize);
  let length = 0;
  // let inFrameCount = 0;

  // https://forum.unity.com/threads/settings-for-importing-a-video-with-an-alpha-channel.457657/
  const streams = await readFileStreams(ffprobePath, path);
  const firstVideoStream = streams.find((s) => s.codec_type === 'video');
  // https://superuser.com/a/1116905/658247

  let inputCodec;
  if (firstVideoStream.codec_name === 'vp8') inputCodec = 'libvpx';
  else if (firstVideoStream.codec_name === 'vp9') inputCodec = 'libvpx-vp9';

  // http://zulko.github.io/blog/2013/09/27/read-and-write-video-frames-in-python-using-ffmpeg/
  // Testing: ffmpeg -i 'vid.mov' -t 1 -vcodec rawvideo -pix_fmt rgba -f image2pipe - | ffmpeg -f rawvideo -vcodec rawvideo -pix_fmt rgba -s 2166x1650 -i - -vf format=yuv420p -vcodec libx264 -y out.mp4
  // https://trac.ffmpeg.org/wiki/ChangingFrameRate
  const args = [
    ...getFfmpegCommonArgs({ enableFfmpegLog }),
    ...(inputCodec ? ['-vcodec', inputCodec] : []),
    ...(cutFrom ? ['-ss', cutFrom] : []),
    '-i', path,
    ...(cutTo ? ['-t', (cutTo - cutFrom) * speedFactor] : []),
    '-vf', `${ptsFilter}fps=${framerateStr},${scaleFilter}`,
    '-map', 'v:0',
    '-vcodec', 'rawvideo',
    '-pix_fmt', 'rgba',
    '-f', 'image2pipe',
    '-',
  ];
  if (verbose) console.log(args.join(' '));

  const ps = execa(ffmpegPath, args, { encoding: null, buffer: false, stdin: 'ignore', stdout: 'pipe', stderr: process.stderr });

  const stream = ps.stdout;

  let timeout;
  let ended = false;

  stream.once('end', () => {
    clearTimeout(timeout);
    if (verbose) console.log(path, 'ffmpeg video stream ended');
    ended = true;
  });

  // returns a frame from the buffer if available
  function getNextFrame() {
    if (length >= frameByteSize) {
      // copy the frame
      buf.copy(frameBuffer, 0, 0, frameByteSize);
      // move remaining buffer content to the beginning
      buf.copy(buf, 0, frameByteSize, length);
      length -= frameByteSize;
      return frameBuffer;
    }
    return null;
  }

  async function readNextFrame(progress, canvas, time) {
    const rgba = await new Promise((resolve, reject) => {
      const frame = getNextFrame();
      if (frame) {
        resolve(frame);
        return;
      }

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
        const nCopied = Math.min(buf.length - length, chunk.length);
        chunk.copy(buf, length, 0, nCopied);
        length += nCopied;
        const out = getNextFrame();
        const restLength = chunk.length - nCopied;
        if (restLength > 0) {
          if (verbose) console.log('Left over data', nCopied, chunk.length, restLength);
          // make sure the buffer can store all chunk data
          if (chunk.length > buf.length) {
            if (verbose) console.log('resizing buffer', buf.length, chunk.length);
            const newBuf = Buffer.allocUnsafe(chunk.length);
            buf.copy(newBuf, 0, 0, length);
            buf = newBuf;
          }
          chunk.copy(buf, length, nCopied);
          length += restLength;
        }

        if (out) {
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

    if (!rgba) return;

    assert(rgba.length === frameByteSize);

    if (logTimes) console.time('rgbaToFabricImage');
    const img = await rgbaToFabricImage({ width: targetWidth, height: targetHeight, rgba });
    if (logTimes) console.timeEnd('rgbaToFabricImage');

    img.setOptions({
      originX,
      originY,
    });

    let centerOffsetX = 0;
    let centerOffsetY = 0;
    if (resizeMode === 'contain' || resizeMode === 'contain-blur') {
      const dirX = originX === 'left' ? 1 : -1;
      const dirY = originY === 'top' ? 1 : -1;
      centerOffsetX = (dirX * (requestedWidth - targetWidth)) / 2;
      centerOffsetY = (dirY * (requestedHeight - targetHeight)) / 2;
    }

    img.setOptions({
      left: left + centerOffsetX,
      top: top + centerOffsetY,
    });

    if (resizeMode === 'contain-blur') {
      const mutableImg = await new Promise((r) => img.cloneAsImage(r));
      const blurredImg = await blurImage({ mutableImg, width: requestedWidth, height: requestedHeight });
      blurredImg.setOptions({
        left,
        top,
        originX,
        originY,
      });
      canvas.add(blurredImg);
    }

    if (fabricImagePostProcessing) {
      fabricImagePostProcessing({ image: img, progress, fabric, canvas, time });
    }

    canvas.add(img);
  }

  const close = () => {
    if (verbose) console.log('Close', path);
    ps.cancel();
  };

  return {
    readNextFrame,
    close,
  };
};
