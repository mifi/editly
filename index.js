const execa = require('execa');
const assert = require('assert');
const pMap = require('p-map');
const { basename, join, dirname } = require('path');
const flatMap = require('lodash/flatMap');
const JSON5 = require('json5');
const fs = require('fs-extra');
const { nanoid } = require('nanoid');

const { parseFps, readVideoFileInfo, readAudioFileInfo, multipleOf2, isUrl } = require('./util');
const { registerFont } = require('./sources/fabric');
const { createFrameSource } = require('./sources/frameSource');
const { calcTransition } = require('./transitions');

const GlTransitions = require('./glTransitions');
const Audio = require('./audio');

// Cache
const loadedFonts = [];

// See #16
const checkTransition = (transition) => assert(transition == null || typeof transition === 'object', 'Transition must be an object');

module.exports = async (config = {}) => {
  const {
    // Testing options:
    enableFfmpegLog = false,
    verbose = false,
    logTimes = false,
    fast,

    outPath,
    clips: clipsIn,
    width: requestedWidth,
    height: requestedHeight,
    fps: requestedFps,
    defaults: defaultsIn = {},
    audioFilePath: audioFilePathIn,
    loopAudio,
    keepSourceAudio,
    allowRemoteRequests,

    ffmpegPath = 'ffmpeg',
    ffprobePath = 'ffprobe',
  } = config;

  const assertFileValid = async (path) => {
    if (isUrl(path)) {
      assert(allowRemoteRequests, 'Remote requests are not allowed');
      return;
    }
    assert(await fs.exists(path), `File does not exist ${path}`);
  };

  const isGif = outPath.toLowerCase().endsWith('.gif');

  let audioFilePath;
  if (!isGif) audioFilePath = audioFilePathIn;

  if (audioFilePath) await assertFileValid(audioFilePath);

  checkTransition(defaultsIn.transition);

  const defaults = {
    duration: 4,
    ...defaultsIn,
    transition: defaultsIn.transition === null ? null : {
      duration: 0.5,
      name: 'random',
      ...defaultsIn.transition,
    },
  };

  if (verbose) console.log(JSON5.stringify(config, null, 2));

  assert(outPath, 'Please provide an output path');
  assert(clipsIn.length > 0, 'Please provide at least 1 clip');

  async function handleLayer(layer) {
    const { type, ...restLayer } = layer;

    // https://github.com/mifi/editly/issues/39
    if (['image', 'image-overlay'].includes(type)) {
      await assertFileValid(restLayer.path);
    } else if (type === 'gl') {
      await assertFileValid(restLayer.fragmentPath);
    }

    if (['fabric', 'canvas'].includes(type)) assert(typeof layer.func === 'function', '"func" must be a function');

    if (['image', 'image-overlay', 'fabric', 'canvas', 'gl', 'radial-gradient', 'linear-gradient', 'fill-color'].includes(type)) return layer;

    // TODO if random-background radial-gradient linear etc
    if (type === 'pause') return handleLayer({ ...restLayer, type: 'fill-color' });

    if (type === 'rainbow-colors') return handleLayer({ type: 'gl', fragmentPath: join(__dirname, 'shaders/rainbow-colors.frag') });

    if (type === 'editly-banner') {
      const { fontPath } = layer;
      return [
        await handleLayer({ type: 'linear-gradient' }),
        await handleLayer({ fontPath, type: 'title', text: 'Made with\nEDITLY\nmifi.no' }),
      ];
    }

    // For convenience
    if (type === 'title-background') {
      const { text, textColor, background, fontFamily, fontPath } = layer;
      const outLayers = [];
      if (background) {
        if (background.type === 'radial-gradient') outLayers.push(await handleLayer({ type: 'radial-gradient', colors: background.colors }));
        else if (background.type === 'linear-gradient') outLayers.push(await handleLayer({ type: 'linear-gradient', colors: background.colors }));
        else if (background.color) outLayers.push(await handleLayer({ type: 'fill-color', color: background.color }));
      } else {
        const backgroundTypes = ['radial-gradient', 'linear-gradient', 'fill-color'];
        const randomType = backgroundTypes[Math.floor(Math.random() * backgroundTypes.length)];
        outLayers.push(await handleLayer({ type: randomType }));
      }
      outLayers.push(await handleLayer({ type: 'title', fontFamily, fontPath, text, textColor }));
      return outLayers;
    }

    if (['title', 'subtitle', 'news-title', 'slide-in-text'].includes(type)) {
      assert(layer.text, 'Please specify a text');

      let { fontFamily } = layer;
      const { fontPath, ...rest } = layer;
      if (fontPath) {
        fontFamily = Buffer.from(basename(fontPath)).toString('base64');
        if (!loadedFonts.includes(fontFamily)) {
          registerFont(fontPath, { family: fontFamily, weight: 'regular', style: 'normal' });
          loadedFonts.push(fontFamily);
        }
      }
      return { ...rest, fontFamily };
    }

    throw new Error(`Invalid layer type ${type}`);
  }

  const clips = await pMap(clipsIn, async (clip, clipIndex) => {
    assert(typeof clip === 'object', '"clips" must contain objects with one or more layers');
    const { transition: userTransition, duration: userClipDuration, layers: layersIn } = clip;

    // Validation
    let layers = layersIn;
    if (!Array.isArray(layers)) layers = [layers]; // Allow single layer for convenience
    assert(layers.every((layer) => layer != null && typeof layer === 'object'), '"clip.layers" must contain one or more objects');
    assert(layers.every((layer) => layer.type != null), 'All "layers" must have a type');

    checkTransition(userTransition);

    const videoLayers = layers.filter((layer) => layer.type === 'video');

    const userClipDurationOrDefault = userClipDuration || defaults.duration;
    if (videoLayers.length === 0) assert(userClipDurationOrDefault, `Duration parameter is required for videoless clip ${clipIndex}`);

    const transition = calcTransition(defaults, userTransition, clipIndex === clipsIn.length - 1);

    let layersOut = flatMap(await pMap(layers, async (layerIn) => {
      const globalLayerDefaults = defaults.layer || {};
      const thisLayerDefaults = (defaults.layerType || {})[layerIn.type];
      const layer = { ...globalLayerDefaults, ...thisLayerDefaults, ...layerIn };
      const { type, path } = layer;

      if (type === 'video') {
        const { duration: fileDuration, width: widthIn, height: heightIn, framerateStr, rotation } = await readVideoFileInfo(ffprobePath, path);
        let { cutFrom, cutTo } = layer;
        if (!cutFrom) cutFrom = 0;
        cutFrom = Math.max(cutFrom, 0);
        cutFrom = Math.min(cutFrom, fileDuration);

        if (!cutTo) cutTo = fileDuration;
        cutTo = Math.max(cutTo, cutFrom);
        cutTo = Math.min(cutTo, fileDuration);
        assert(cutFrom < cutTo, 'cutFrom must be lower than cutTo');

        const inputDuration = cutTo - cutFrom;

        const isRotated = rotation === 90 || rotation === 270;
        const width = isRotated ? heightIn : widthIn;
        const height = isRotated ? widthIn : heightIn;

        // Compensate for transition duration
        const audioCutTo = Math.max(cutFrom, cutTo - transition.duration);

        return { ...layer, cutFrom, cutTo, audioCutTo, inputDuration, width, height, framerateStr };
      }

      // Audio is handled later
      if (type === 'audio') return layer;

      return handleLayer(layer);
    }, { concurrency: 1 }));

    let clipDuration = userClipDurationOrDefault;

    const firstVideoLayer = layersOut.find((layer) => layer.type === 'video');
    if (firstVideoLayer && !userClipDuration) clipDuration = firstVideoLayer.inputDuration;
    assert(clipDuration);

    // We need to map again, because for audio, we need to know the correct clipDuration
    layersOut = await pMap(layersOut, async (layerIn) => {
      const { type, path, visibleUntil, visibleFrom = 0 } = layerIn;

      // This feature allows the user to show another layer overlayed (or replacing) parts of the lower layers (visibleFrom - visibleUntil)
      const visibleDuration = ((visibleUntil || clipDuration) - visibleFrom);
      assert(visibleDuration > 0 && visibleDuration <= clipDuration, `Invalid visibleFrom ${visibleFrom} or visibleUntil ${visibleUntil} (${clipDuration})`);
      // TODO Also need to handle video layers (framePtsFactor etc)
      // TODO handle audio in case of visibleFrom/visibleTo

      const layer = { ...layerIn, visibleFrom, visibleDuration };

      if (type === 'audio') {
        const { duration: fileDuration } = await readAudioFileInfo(ffprobePath, path);
        let { cutFrom, cutTo } = layer;

        // console.log({ cutFrom, cutTo, fileDuration, clipDuration });

        if (!cutFrom) cutFrom = 0;
        cutFrom = Math.max(cutFrom, 0);
        cutFrom = Math.min(cutFrom, fileDuration);

        if (!cutTo) cutTo = cutFrom + clipDuration;
        cutTo = Math.max(cutTo, cutFrom);
        cutTo = Math.min(cutTo, fileDuration);
        assert(cutFrom < cutTo, 'cutFrom must be lower than cutTo');

        const inputDuration = cutTo - cutFrom;

        const framePtsFactor = clipDuration / inputDuration;

        // Compensate for transition duration
        const audioCutTo = Math.max(cutFrom, cutTo - transition.duration);

        return { ...layer, cutFrom, cutTo, audioCutTo, framePtsFactor };
      }

      if (layer.type === 'video') {
        const { inputDuration } = layer;

        let framePtsFactor;

        // If user explicitly specified duration for clip, it means that should be the output duration of the video
        if (userClipDuration) {
          // Later we will speed up or slow down video using this factor
          framePtsFactor = userClipDuration / inputDuration;
        } else {
          framePtsFactor = 1;
        }

        return { ...layer, framePtsFactor };
      }

      return layer;
    });

    return {
      transition,
      duration: clipDuration,
      layers: layersOut,
    };
  }, { concurrency: 1 });

  const { editAudio } = Audio({ ffmpegPath, ffprobePath, enableFfmpegLog, verbose });

  const outDir = dirname(outPath);
  const tmpDir = join(outDir, `editly-tmp-${nanoid()}`);
  if (verbose) console.log({ tmpDir });
  await fs.remove(tmpDir);
  await fs.mkdirp(tmpDir);

  if (!audioFilePath && keepSourceAudio) {
    audioFilePath = await editAudio({ clips, tmpDir });
  }

  if (verbose) console.log(JSON5.stringify(clips, null, 2));

  // Try to detect parameters from first video
  let detectedWidth;
  let detectedHeight;
  let firstVideoFramerateStr;

  clips.find((clip) => clip && clip.layers.find((layer) => {
    if (layer.type === 'video') {
      detectedWidth = layer.width;
      detectedHeight = layer.height;
      firstVideoFramerateStr = layer.framerateStr;

      return true;
    }
    return false;
  }));

  let width;
  let height;

  let desiredWidth;

  if (fast) desiredWidth = 320;
  else if (requestedWidth) desiredWidth = requestedWidth;
  else if (isGif) desiredWidth = 320;

  if (detectedWidth && detectedHeight) {
    if (desiredWidth) {
      const calculatedHeight = Math.round((detectedHeight / detectedWidth) * desiredWidth);
      height = isGif ? calculatedHeight : multipleOf2(calculatedHeight); // x264 requires multiple of 2
      width = desiredWidth;
    } else {
      width = detectedWidth;
      height = detectedHeight;
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
  if (!fast && requestedWidth && requestedHeight) {
    width = requestedWidth;
    height = requestedHeight;
  }

  assert(width, 'Width not specified or detected');
  assert(height, 'Height not specified or detected');

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

  const channels = 4;

  const { runTransitionOnFrame } = GlTransitions({ width, height, channels });

  function startFfmpegWriterProcess() {
    // https://superuser.com/questions/556029/how-do-i-convert-a-video-to-gif-using-ffmpeg-with-reasonable-quality
    const outputArgs = isGif ? [
      '-vf',
      `fps=${fps},scale=${width}:${height}:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
      '-loop', 0,
      '-y', outPath,
    ] : [
      '-vf', 'format=yuv420p',
      '-vcodec', 'libx264',
      '-profile:v', 'high',
      ...(fast ? ['-preset:v', 'ultrafast'] : ['-preset:v', 'medium']),
      '-crf', '18',

      '-movflags', 'faststart',
      '-y', outPath,
    ];

    const loopAudioArgs = loopAudio ? ['-stream_loop', '-1'] : [];

    const args = [
      ...(enableFfmpegLog ? [] : ['-hide_banner', '-loglevel', 'error']),

      '-f', 'rawvideo',
      '-vcodec', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-s', `${width}x${height}`,
      '-r', framerateStr,
      '-i', '-',

      ...(audioFilePath ? [...loopAudioArgs, '-i', audioFilePath, '-shortest'] : []),

      '-map', '0:v:0',
      ...(audioFilePath ? ['-map', '1:a:0'] : []),

      ...(audioFilePath ? ['-acodec', 'aac', '-b:a', '128k'] : []),

      ...outputArgs,
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
    await fs.remove(tmpDir);
  }

  try {
    if (verbose) console.log('Waiting for output ffmpeg process to finish');
    await outProcess;
  } catch (err) {
    if (outProcessExitCode !== 0 && !err.killed) throw err;
  }

  console.log();
  console.log('Done. Output file can be found at:');
  console.log(outPath);
};
