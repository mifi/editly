const execa = require('execa');
const assert = require('assert');
const pMap = require('p-map');
const { basename, join } = require('path');
const flatMap = require('lodash/flatMap');
const JSON5 = require('json5');
const fs = require('fs-extra');

const { parseFps, readFileInfo, multipleOf2 } = require('./util');
const { registerFont } = require('./sources/fabricFrameSource');
const { createFrameSource } = require('./sources/frameSource');
const { calcTransition } = require('./transitions');

const GlTransitions = require('./glTransitions');

// Cache
const loadedFonts = [];

// See #16
const checkTransition = (transition) => assert(transition == null || typeof transition === 'object', 'Transition must be an object');

const assertFileExists = async (path, enableRemote) => assert((enableRemote && path.startsWith('http')) || await fs.exists(path), `File does not exist ${path}`);


module.exports = async (config = {}) => {
  const {
    // Testing options:
    enableFfmpegLog = false,
    verbose = false,
    fast,

    outPath,
    clips: clipsIn,
    width: requestedWidth,
    height: requestedHeight,
    fps: requestedFps,
    defaults: defaultsIn = {},
    audioFilePath: audioFilePathIn,

    ffmpegPath = 'ffmpeg',
    ffprobePath = 'ffprobe',

    onStart,
    onProcessStart,
    
  } = config;

  assert(!onStart || typeof onStart === 'function', 'Callback onStart expected to be a function');
  assert(!onProcessStart || typeof onProcessStart === 'function', 'Callback onProcessStart expected to be a function');

  const isGif = outPath.toLowerCase().endsWith('.gif');

  const audioFilePath = isGif ? undefined : audioFilePathIn;

  if (audioFilePath) await assertFileExists(audioFilePath, true);

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
    if (type === 'image') {
      await assertFileExists(restLayer.path, true);
    } else if (type === 'gl') {
      await assertFileExists(restLayer.fragmentPath);
    }

    if (['fabric', 'canvas'].includes(type)) assert(typeof layer.func === 'function', '"func" must be a function');

    if (['image', 'fabric', 'canvas', 'gl', 'radial-gradient', 'linear-gradient', 'fill-color'].includes(type)) return layer;

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

    if (['title', 'subtitle', 'news-title'].includes(type)) {
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
    const { transition: userTransition, duration: userDuration, layers } = clip;

    checkTransition(userTransition);

    const videoLayers = layers.filter((layer) => layer.type === 'video');
    assert(videoLayers.length <= 1, 'Max 1 video per layer');

    const userOrDefaultDuration = userDuration || defaults.duration;
    if (videoLayers.length === 0) assert(userOrDefaultDuration, `Duration is required for clip ${clipIndex}`);

    let duration = userOrDefaultDuration;

    const layersOut = flatMap(await pMap(layers, async (layerIn) => {
      const layer = { ...defaults.layer, ...layerIn };
      const { type } = layer;

      if (type === 'video') {
        const { cutFrom: cutFromIn, cutTo: cutToIn, path } = layer;
        const fileInfo = await readFileInfo(ffprobePath, path);
        const { duration: fileDuration, width: widthIn, height: heightIn, framerateStr, rotation } = fileInfo;
        let cutFrom;
        let cutTo;
        let trimmedSourceDuration = fileDuration;
        if (cutFromIn != null || cutToIn != null) {
          cutFrom = Math.min(Math.max(0, cutFromIn || 0), fileDuration);
          cutTo = Math.min(Math.max(cutFrom, cutToIn || fileDuration), fileDuration);
          assert(cutFrom < cutTo, 'cutFrom must be lower than cutTo');

          trimmedSourceDuration = cutTo - cutFrom;
        }

        // If user specified duration, means that should be the output duration
        let framePtsFactor;
        if (userDuration) {
          duration = userDuration;
          framePtsFactor = userDuration / trimmedSourceDuration;
        } else {
          duration = trimmedSourceDuration;
          framePtsFactor = 1;
        }

        const isRotated = rotation === 90 || rotation === 270;
        const width = isRotated ? heightIn : widthIn;
        const height = isRotated ? widthIn : heightIn;

        return { ...layer, cutFrom, cutTo, width, height, framerateStr, framePtsFactor };
      }

      return handleLayer(layer);
    }, { concurrency: 1 }));

    const transition = calcTransition(defaults, userTransition);

    return {
      transition,
      duration,
      layers: layersOut,
    };
  }, { concurrency: 1 });

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

    const args = [
      ...(enableFfmpegLog ? [] : ['-hide_banner', '-loglevel', 'error']),

      '-f', 'rawvideo',
      '-vcodec', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-s', `${width}x${height}`,
      '-r', framerateStr,
      '-i', '-',

      ...(audioFilePath ? ['-i', audioFilePath, '-shortest'] : []),

      '-map', '0:v:0',
      ...(audioFilePath ? ['-map', '1:a:0'] : []),

      ...(audioFilePath ? ['-acodec', 'aac', '-b:a', '128k'] : []),

      ...outputArgs,
    ];
    if (verbose) console.log('ffmpeg', args.join(' '));
    if (onStart) onStart(`ffmpeg ${args.join(' ')}`);
    return execa(ffmpegPath, args, { encoding: null, buffer: false, stdin: 'pipe', stdout: process.stdout, stderr: process.stderr });
  }

  let outProcess;
  let frameSource1;
  let frameSource2;

  try {
    outProcess = startFfmpegWriterProcess();
    if (onProcessStart) onProcessStart(outProcess);
    let outProcessError;

    // If we don't catch it here, the whole process will crash and we cannot process the error
    outProcess.stdin.on('error', (err) => {
      console.error('Output ffmpeg caught error', err);
      outProcessError = err;
    });

    let totalFrameCount = 0;
    let fromClipFrameCount = 0;
    let toClipFrameCount = 0;

    let transitionFromClipId = 0;

    const getTransitionToClipId = () => transitionFromClipId + 1;
    const getTransitionFromClip = () => clips[transitionFromClipId];
    const getTransitionToClip = () => clips[getTransitionToClipId()];

    const getSource = (clip, clipIndex) => createFrameSource({ clip, clipIndex, width, height, channels, verbose, ffmpegPath, enableFfmpegLog, framerateStr });

    const getTransitionToSource = async () => (getTransitionToClip() && getSource(getTransitionToClip(), getTransitionToClipId()));
    frameSource1 = await getSource(getTransitionFromClip(), transitionFromClipId);
    frameSource2 = await getTransitionToSource();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const fromClipNumFrames = Math.round(getTransitionFromClip().duration * fps);
      const toClipNumFrames = getTransitionToClip() && Math.round(getTransitionToClip().duration * fps);
      const fromClipProgress = fromClipFrameCount / fromClipNumFrames;
      const toClipProgress = getTransitionToClip() && toClipFrameCount / toClipNumFrames;
      const frameData1 = await frameSource1.readNextFrame(fromClipProgress);

      const clipTransition = getTransitionFromClip().transition;

      const transitionNumFrames = Math.round(clipTransition.duration * fps);

      // Each clip has two transitions, make sure we leave enough room:
      const transitionNumFramesSafe = Math.floor(Math.min(Math.min(fromClipNumFrames, toClipNumFrames != null ? toClipNumFrames : Number.MAX_SAFE_INTEGER) / 2, transitionNumFrames));
      // How many frames into the transition are we? negative means not yet started
      const transitionFrameAt = fromClipFrameCount - (fromClipNumFrames - transitionNumFramesSafe);

      if (verbose) console.log('Frame', totalFrameCount, 'from', fromClipFrameCount, `(clip ${transitionFromClipId})`, 'to', toClipFrameCount, `(clip ${getTransitionToClipId()})`);

      if (!verbose) {
        const percentDone = Math.floor(100 * (totalFrameCount / estimatedTotalFrames));
        if (totalFrameCount % 10 === 0) process.stdout.write(`${String(percentDone).padStart(3, ' ')}% `);
      }

      if (!frameData1 || transitionFrameAt >= transitionNumFramesSafe - 1) {
      // if (!frameData1 || transitionFrameAt >= transitionNumFramesSafe) {
        console.log('Done with transition, switching to next clip');
        transitionFromClipId += 1;

        if (!getTransitionFromClip()) {
          console.log('No more transitionFromClip, done');
          break;
        }

        // Cleanup old, swap and load next
        await frameSource1.close();
        frameSource1 = frameSource2;
        frameSource2 = await getTransitionToSource();

        fromClipFrameCount = transitionNumFramesSafe;
        toClipFrameCount = 0;
      } else {
        let outFrameData;
        if (frameSource2 && transitionFrameAt >= 0) {
          if (verbose) console.log('Transition', 'frame', transitionFrameAt, '/', transitionNumFramesSafe, clipTransition.name, `${clipTransition.duration}s`);

          const frameData2 = await frameSource2.readNextFrame(toClipProgress);
          toClipFrameCount += 1;

          if (frameData2) {
            const progress = transitionFrameAt / transitionNumFramesSafe;
            const easedProgress = clipTransition.easingFunction(progress);

            if (verbose) console.time('runTransitionOnFrame');
            outFrameData = runTransitionOnFrame({ fromFrame: frameData1, toFrame: frameData2, progress: easedProgress, transitionName: clipTransition.name, transitionParams: clipTransition.params });
            if (verbose) console.timeEnd('runTransitionOnFrame');
          } else {
            console.warn('Got no frame data from clip 2!');
            // We have reached end of clip2 but transition is not complete
            // Pass thru
            // TODO improve, maybe cut it short
            outFrameData = frameData1;
          }
        } else {
          outFrameData = frameData1;
        }

        // If we don't await we get EINVAL when dealing with high resolution files (big writes)
        await new Promise((r) => outProcess.stdin.write(outFrameData, () => r()));

        if (outProcessError) throw outProcessError;

        fromClipFrameCount += 1;
      }

      totalFrameCount += 1;
    }

    outProcess.stdin.end();

    console.log('Done. Output file can be found at:');
    console.log(outPath);
  } catch (err) {
    console.error('Loop failed', err);
    if (outProcess) {
      outProcess.kill();
    }
  } finally {
    if (frameSource1) await frameSource1.close();
    if (frameSource2) await frameSource2.close();
  }

  try {
    await outProcess;
  } catch (err) {
    if (!err.killed) throw err;
  }
};
