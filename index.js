import { execa } from 'execa';
import assert from 'assert';
import { join, dirname } from 'path';
import JSON5 from 'json5';
import fsExtra from 'fs-extra';
import { nanoid } from 'nanoid';

import { testFf } from './ffmpeg.js';
import { parseFps, multipleOf2, assertFileValid, checkTransition } from './util.js';
import { createFabricCanvas, rgbaToFabricImage, getNodeCanvasFromFabricCanvas } from './sources/fabric.js';
import { createFrameSource } from './sources/frameSource.js';
import parseConfig from './parseConfig.js';
import GlTransitions from './glTransitions.js';
import Audio from './audio.js';

const channels = 4;

async function Editly(config = {}) {
  const {
    // Testing options:
    enableFfmpegLog = false,
    verbose = false,
    logTimes = false,
    keepTmp = false,
    fast,

    outPath,
    clips: clipsIn,
    clipsAudioVolume = 1,
    audioTracks: arbitraryAudioIn = [],
    width: requestedWidth,
    height: requestedHeight,
    fps: requestedFps,
    defaults = {},
    audioFilePath: backgroundAudioPath,
    backgroundAudioVolume,
    loopAudio,
    keepSourceAudio,
    allowRemoteRequests,
    audioNorm,
    outputVolume,
    customOutputArgs,

    ffmpegPath = 'ffmpeg',
    ffprobePath = 'ffprobe',
  } = config;

  await testFf(ffmpegPath, 'ffmpeg');
  await testFf(ffprobePath, 'ffprobe');

  const isGif = outPath.toLowerCase().endsWith('.gif');

  if (backgroundAudioPath) await assertFileValid(backgroundAudioPath, allowRemoteRequests);

  checkTransition(defaults.transition);

  if (verbose) console.log(JSON5.stringify(config, null, 2));

  assert(outPath, 'Please provide an output path');
  assert(clipsIn.length > 0, 'Please provide at least 1 clip');

  const { clips, arbitraryAudio } = await parseConfig({ defaults, clips: clipsIn, arbitraryAudio: arbitraryAudioIn, backgroundAudioPath, backgroundAudioVolume, loopAudio, allowRemoteRequests, ffprobePath });
  if (verbose) console.log('Calculated', JSON5.stringify({ clips, arbitraryAudio }, null, 2));

  const outDir = dirname(outPath);
  const tmpDir = join(outDir, `editly-tmp-${nanoid()}`);
  if (verbose) console.log({ tmpDir });
  await fsExtra.mkdirp(tmpDir);

  const { editAudio } = Audio({ ffmpegPath, ffprobePath, enableFfmpegLog, verbose, tmpDir });

  const audioFilePath = !isGif ? await editAudio({ keepSourceAudio, arbitraryAudio, clipsAudioVolume, clips, audioNorm, outputVolume }) : undefined;

  // Try to detect parameters from first video
  let firstVideoWidth;
  let firstVideoHeight;
  let firstVideoFramerateStr;

  clips.find((clip) => clip && clip.layers.find((layer) => {
    if (layer.type === 'video') {
      firstVideoWidth = layer.inputWidth;
      firstVideoHeight = layer.inputHeight;
      firstVideoFramerateStr = layer.framerateStr;

      return true;
    }
    return false;
  }));

  let width;
  let height;

  let desiredWidth;

  if (requestedWidth) desiredWidth = requestedWidth;
  else if (isGif) desiredWidth = 320;

  const roundDimension = (val) => (isGif ? Math.round(val) : multipleOf2(val));

  if (firstVideoWidth && firstVideoHeight) {
    if (desiredWidth) {
      const calculatedHeight = (firstVideoHeight / firstVideoWidth) * desiredWidth;
      height = roundDimension(calculatedHeight);
      width = desiredWidth;
    } else {
      width = firstVideoWidth;
      height = firstVideoHeight;
    }
  } else if (desiredWidth) {
    width = desiredWidth;
    height = desiredWidth;
    // console.log(`Cannot detect width/height from video, set defaults ${width}x${height}`);
  } else {
    // No video
    width = 640;
    height = 640;
  }

  // User override?
  if (requestedWidth && requestedHeight) {
    width = requestedWidth;
    height = requestedHeight;
  }

  if (fast) {
    const numPixelsEachDirection = 250;
    const aspectRatio = width / height;
    width = roundDimension(numPixelsEachDirection * Math.sqrt(aspectRatio));
    height = roundDimension(numPixelsEachDirection * Math.sqrt(1 / aspectRatio));
  }

  assert(width, 'Width not specified or detected');
  assert(height, 'Height not specified or detected');

  if (!isGif) {
    // x264 requires multiple of 2, eg minimum 2
    width = Math.max(2, width);
    height = Math.max(2, height);
  }

  let fps;
  let framerateStr;

  if (fast) {
    fps = 15;
    framerateStr = String(fps);
  } else if (requestedFps && typeof requestedFps === 'number') {
    fps = requestedFps;
    framerateStr = String(requestedFps);
  } else if (isGif) {
    fps = 10;
    framerateStr = String(fps);
  } else if (firstVideoFramerateStr) {
    fps = parseFps(firstVideoFramerateStr);
    framerateStr = firstVideoFramerateStr;
  } else {
    fps = 25;
    framerateStr = String(fps);
  }

  assert(fps, 'FPS not specified or detected');

  console.log(`${width}x${height} ${fps}fps`);

  const estimatedTotalFrames = fps * clips.reduce((acc, c, i) => {
    let newAcc = acc + c.duration;
    if (i !== clips.length - 1) newAcc -= c.transition.duration;
    return newAcc;
  }, 0);

  const { runTransitionOnFrame: runGlTransitionOnFrame } = GlTransitions({ width, height, channels });

  function runTransitionOnFrame({ fromFrame, toFrame, progress, transitionName, transitionParams }) {
    // A dummy transition can be used to have an audio transition without a video transition
    // (Note: You will lose a portion from both clips due to overlap)
    if (transitionName === 'dummy') return progress > 0.5 ? toFrame : fromFrame;
    return runGlTransitionOnFrame({ fromFrame, toFrame, progress, transitionName, transitionParams });
  }

  function getOutputArgs() {
    if (customOutputArgs) {
      assert(Array.isArray(customOutputArgs), 'customOutputArgs must be an array of arguments');
      return customOutputArgs;
    }

    // https://superuser.com/questions/556029/how-do-i-convert-a-video-to-gif-using-ffmpeg-with-reasonable-quality
    const videoOutputArgs = isGif ? [
      '-vf', `format=rgb24,fps=${fps},scale=${width}:${height}:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
      '-loop', 0,
    ] : [
      '-vf', 'format=yuv420p',
      '-vcodec', 'libx264',
      '-profile:v', 'high',
      ...(fast ? ['-preset:v', 'ultrafast'] : ['-preset:v', 'medium']),
      '-crf', '18',

      '-movflags', 'faststart',
    ];

    const audioOutputArgs = audioFilePath ? ['-acodec', 'aac', '-b:a', '128k'] : [];

    return [...audioOutputArgs, ...videoOutputArgs];
  }

  function startFfmpegWriterProcess() {
    const args = [
      ...(enableFfmpegLog ? [] : ['-hide_banner', '-loglevel', 'error']),

      '-f', 'rawvideo',
      '-vcodec', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-s', `${width}x${height}`,
      '-r', framerateStr,
      '-i', '-',

      ...(audioFilePath ? ['-i', audioFilePath] : []),

      ...(!isGif ? ['-map', '0:v:0'] : []),
      ...(audioFilePath ? ['-map', '1:a:0'] : []),

      ...getOutputArgs(),

      '-y', outPath,
    ];
    if (verbose) console.log('ffmpeg', args.join(' '));
    return execa(ffmpegPath, args, { encoding: null, buffer: false, stdin: 'pipe', stdout: process.stdout, stderr: process.stderr });
  }

  let outProcess;
  let outProcessExitCode;

  let frameSource1;
  let frameSource2;

  let frameSource1Data;

  let totalFramesWritten = 0;
  let fromClipFrameAt = 0;
  let toClipFrameAt = 0;

  let transitionFromClipId = 0;

  const getTransitionToClipId = () => transitionFromClipId + 1;
  const getTransitionFromClip = () => clips[transitionFromClipId];
  const getTransitionToClip = () => clips[getTransitionToClipId()];

  const getSource = async (clip, clipIndex) => createFrameSource({ clip, clipIndex, width, height, channels, verbose, logTimes, ffmpegPath, ffprobePath, enableFfmpegLog, framerateStr });
  const getTransitionFromSource = async () => getSource(getTransitionFromClip(), transitionFromClipId);
  const getTransitionToSource = async () => (getTransitionToClip() && getSource(getTransitionToClip(), getTransitionToClipId()));

  try {
    try {
      outProcess = startFfmpegWriterProcess();

      let outProcessError;

      outProcess.on('exit', (code) => {
        if (verbose) console.log('Output ffmpeg exited', code);
        outProcessExitCode = code;
      });

      // If we write and get an EPIPE (like when ffmpeg fails or is finished), we could get an unhandled rejection if we don't catch the promise
      // (and meow causes the CLI to exit on unhandled rejections making it hard to see)
      outProcess.catch((err) => {
        outProcessError = err;
      });

      frameSource1 = await getTransitionFromSource();
      frameSource2 = await getTransitionToSource();

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const transitionToClip = getTransitionToClip();
        const transitionFromClip = getTransitionFromClip();
        const fromClipNumFrames = Math.round(transitionFromClip.duration * fps);
        const toClipNumFrames = transitionToClip && Math.round(transitionToClip.duration * fps);
        const fromClipProgress = fromClipFrameAt / fromClipNumFrames;
        const toClipProgress = transitionToClip && toClipFrameAt / toClipNumFrames;
        const fromClipTime = transitionFromClip.duration * fromClipProgress;
        const toClipTime = transitionToClip && transitionToClip.duration * toClipProgress;

        const currentTransition = transitionFromClip.transition;

        const transitionNumFrames = Math.round(currentTransition.duration * fps);

        // Each clip has two transitions, make sure we leave enough room:
        const transitionNumFramesSafe = Math.floor(Math.min(Math.min(fromClipNumFrames, toClipNumFrames != null ? toClipNumFrames : Number.MAX_SAFE_INTEGER) / 2, transitionNumFrames));
        // How many frames into the transition are we? negative means not yet started
        const transitionFrameAt = fromClipFrameAt - (fromClipNumFrames - transitionNumFramesSafe);

        if (!verbose) {
          const percentDone = Math.floor(100 * (totalFramesWritten / estimatedTotalFrames));
          if (totalFramesWritten % 10 === 0) process.stdout.write(`${String(percentDone).padStart(3, ' ')}% `);
        }

        // console.log({ transitionFrameAt, transitionNumFramesSafe })
        // const transitionLastFrameIndex = transitionNumFramesSafe - 1;
        const transitionLastFrameIndex = transitionNumFramesSafe;

        // Done with transition?
        if (transitionFrameAt >= transitionLastFrameIndex) {
          transitionFromClipId += 1;
          console.log(`Done with transition, switching to next transitionFromClip (${transitionFromClipId})`);

          if (!getTransitionFromClip()) {
            console.log('No more transitionFromClip, done');
            break;
          }

          // Cleanup completed frameSource1, swap and load next frameSource2
          await frameSource1.close();
          frameSource1 = frameSource2;
          frameSource2 = await getTransitionToSource();

          fromClipFrameAt = transitionLastFrameIndex;
          toClipFrameAt = 0;

          // eslint-disable-next-line no-continue
          continue;
        }

        if (logTimes) console.time('Read frameSource1');
        const newFrameSource1Data = await frameSource1.readNextFrame({ time: fromClipTime });
        if (logTimes) console.timeEnd('Read frameSource1');
        // If we got no data, use the old data
        // TODO maybe abort?
        if (newFrameSource1Data) frameSource1Data = newFrameSource1Data;
        else console.warn('No frame data returned, using last frame');

        const isInTransition = frameSource2 && transitionNumFramesSafe > 0 && transitionFrameAt >= 0;

        let outFrameData;

        if (isInTransition) {
          if (logTimes) console.time('Read frameSource2');
          const frameSource2Data = await frameSource2.readNextFrame({ time: toClipTime });
          if (logTimes) console.timeEnd('Read frameSource2');

          if (frameSource2Data) {
            const progress = transitionFrameAt / transitionNumFramesSafe;
            const easedProgress = currentTransition.easingFunction(progress);

            if (logTimes) console.time('runTransitionOnFrame');
            outFrameData = runTransitionOnFrame({ fromFrame: frameSource1Data, toFrame: frameSource2Data, progress: easedProgress, transitionName: currentTransition.name, transitionParams: currentTransition.params });
            if (logTimes) console.timeEnd('runTransitionOnFrame');
          } else {
            console.warn('Got no frame data from transitionToClip!');
            // We have probably reached end of clip2 but transition is not complete. Just pass thru clip1
            outFrameData = frameSource1Data;
          }
        } else {
          // Not in transition. Pass thru clip 1
          outFrameData = frameSource1Data;
        }

        if (verbose) {
          if (isInTransition) console.log('Writing frame:', totalFramesWritten, 'from clip', transitionFromClipId, `(frame ${fromClipFrameAt})`, 'to clip', getTransitionToClipId(), `(frame ${toClipFrameAt} / ${transitionNumFramesSafe})`, currentTransition.name, `${currentTransition.duration}s`);
          else console.log('Writing frame:', totalFramesWritten, 'from clip', transitionFromClipId, `(frame ${fromClipFrameAt})`);
          // console.log(outFrameData.length / 1e6, 'MB');
        }

        const nullOutput = false;

        if (logTimes) console.time('outProcess.write');

        // If we don't wait, then we get EINVAL when dealing with high resolution files (big writes)
        if (!nullOutput) await new Promise((r) => outProcess.stdin.write(outFrameData, r));

        if (logTimes) console.timeEnd('outProcess.write');

        if (outProcessError) break;

        totalFramesWritten += 1;
        fromClipFrameAt += 1;
        if (isInTransition) toClipFrameAt += 1;
      } // End while loop

      outProcess.stdin.end();
    } catch (err) {
      outProcess.kill();
      throw err;
    } finally {
      if (verbose) console.log('Cleanup');
      if (frameSource1) await frameSource1.close();
      if (frameSource2) await frameSource2.close();
    }

    try {
      if (verbose) console.log('Waiting for output ffmpeg process to finish');
      await outProcess;
    } catch (err) {
      if (outProcessExitCode !== 0 && !err.killed) throw err;
    }
  } finally {
    if (!keepTmp) await fsExtra.remove(tmpDir);
  }

  console.log();
  console.log('Done. Output file can be found at:');
  console.log(outPath);
}

// Pure function to get a frame at a certain time
// TODO I think this does not respect transition durations
async function renderSingleFrame({
  time = 0,
  defaults,
  width = 800,
  height = 600,
  clips: clipsIn,

  verbose,
  logTimes,
  enableFfmpegLog,
  allowRemoteRequests,
  ffprobePath = 'ffprobe',
  ffmpegPath = 'ffmpeg',
  outPath = `${Math.floor(Math.random() * 1e12)}.png`,
}) {
  const clips = await parseConfig({ defaults, clips: clipsIn, arbitraryAudio: [], allowRemoteRequests, ffprobePath });
  let clipStartTime = 0;
  const clip = clips.find((c) => {
    if (clipStartTime <= time && clipStartTime + c.duration > time) return true;
    clipStartTime += c.duration;
    return false;
  });
  assert(clip, 'No clip found at requested time');
  const clipIndex = clips.indexOf(clip);
  const frameSource = await createFrameSource({ clip, clipIndex, width, height, channels, verbose, logTimes, ffmpegPath, ffprobePath, enableFfmpegLog, framerateStr: '1' });
  const rgba = await frameSource.readNextFrame({ time: time - clipStartTime });

  // TODO converting rgba to png can be done more easily?
  const canvas = createFabricCanvas({ width, height });
  const fabricImage = await rgbaToFabricImage({ width, height, rgba });
  canvas.add(fabricImage);
  canvas.renderAll();
  const internalCanvas = getNodeCanvasFromFabricCanvas(canvas);
  await fsExtra.writeFile(outPath, internalCanvas.toBuffer('image/png'));
  canvas.clear();
  canvas.dispose();
  await frameSource.close();
}

Editly.renderSingleFrame = renderSingleFrame;

export default Editly;
