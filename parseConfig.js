const pMap = require('p-map');
const { basename, join } = require('path');
const flatMap = require('lodash/flatMap');
const assert = require('assert');

const { readVideoFileInfo, readAudioFileInfo } = require('./util');
const { registerFont } = require('./sources/fabric');
const { calcTransition } = require('./transitions');

const { assertFileValid, checkTransition } = require('./util');

// Cache
const loadedFonts = [];


async function parseConfig({ defaults: defaultsIn = {}, clips, allowRemoteRequests, ffprobePath }) {
  const defaults = {
    duration: 4,
    ...defaultsIn,
    transition: defaultsIn.transition === null ? null : {
      duration: 0.5,
      name: 'random',
      ...defaultsIn.transition,
    },
  };

  async function handleLayer(layer) {
    const { type, ...restLayer } = layer;

    // https://github.com/mifi/editly/issues/39
    if (['image', 'image-overlay'].includes(type)) {
      await assertFileValid(restLayer.path, allowRemoteRequests);
    } else if (type === 'gl') {
      await assertFileValid(restLayer.fragmentPath, allowRemoteRequests);
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

  return pMap(clips, async (clip, clipIndex) => {
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

    const transition = calcTransition(defaults, userTransition, clipIndex === clips.length - 1);

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
        const inputWidth = isRotated ? heightIn : widthIn;
        const inputHeight = isRotated ? widthIn : heightIn;

        // Compensate for transition duration
        const audioCutTo = Math.max(cutFrom, cutTo - transition.duration);

        return { ...layer, cutFrom, cutTo, audioCutTo, inputDuration, framerateStr, inputWidth, inputHeight };
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
}

module.exports = parseConfig;
