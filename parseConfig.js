import pMap from 'p-map';
import { basename, join } from 'path';
import flatMap from 'lodash-es/flatMap.js';
import assert from 'assert';
import { fileURLToPath } from 'url';

import {
  readVideoFileInfo,
  readAudioFileInfo,
  assertFileValid,
  checkTransition,
} from './util.js';
import { registerFont } from './sources/fabric.js';
import { calcTransition } from './transitions.js';

const dirname = fileURLToPath(new URL('.', import.meta.url));

// Cache
const loadedFonts = [];

async function validateArbitraryAudio(audio, allowRemoteRequests) {
  assert(audio === undefined || Array.isArray(audio));

  if (audio) {
    // eslint-disable-next-line no-restricted-syntax
    for (const { path, cutFrom, cutTo, start } of audio) {
      await assertFileValid(path, allowRemoteRequests);

      if (cutFrom != null && cutTo != null) assert(cutTo > cutFrom);
      if (cutFrom != null) assert(cutFrom >= 0);
      if (cutTo != null) assert(cutTo >= 0);
      assert(start == null || start >= 0, `Invalid "start" ${start}`);
    }
  }
}

export default async function parseConfig({ defaults: defaultsIn = {}, clips, arbitraryAudio: arbitraryAudioIn, backgroundAudioPath, backgroundAudioVolume, loopAudio, allowRemoteRequests, ffprobePath }) {
  const defaults = {
    duration: 4,
    ...defaultsIn,
    transition: defaultsIn.transition === null ? null : {
      duration: 0.5,
      name: 'random',
      audioOutCurve: 'tri',
      audioInCurve: 'tri',
      ...defaultsIn.transition,
    },
  };

  async function handleLayer(layer) {
    const { type, ...restLayer } = layer;

    // https://github.com/mifi/editly/issues/39
    if (['image', 'image-overlay'].includes(type)) {
      await assertFileValid(restLayer.path, allowRemoteRequests);
    } else if (type === 'gl' && restLayer.fragmentPath) {
      await assertFileValid(restLayer.fragmentPath, allowRemoteRequests);
    }

    if (['fabric', 'canvas'].includes(type)) assert(typeof layer.func === 'function', '"func" must be a function');

    if (['image', 'image-overlay', 'fabric', 'canvas', 'gl', 'radial-gradient', 'linear-gradient', 'fill-color'].includes(type)) return layer;

    // TODO if random-background radial-gradient linear etc
    if (type === 'pause') return handleLayer({ ...restLayer, type: 'fill-color' });

    if (type === 'rainbow-colors') return handleLayer({ type: 'gl', fragmentPath: join(dirname, 'shaders/rainbow-colors.frag') });

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

  const detachedAudioByClip = {};

  let clipsOut = await pMap(clips, async (clip, clipIndex) => {
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

        const isRotated = [-90, 90, 270, -270].includes(rotation);
        const inputWidth = isRotated ? heightIn : widthIn;
        const inputHeight = isRotated ? widthIn : heightIn;

        return { ...layer, cutFrom, cutTo, inputDuration, framerateStr, inputWidth, inputHeight };
      }

      // Audio is handled later
      if (['audio', 'detached-audio'].includes(type)) return layer;

      return handleLayer(layer);
    }, { concurrency: 1 }));

    let clipDuration = userClipDurationOrDefault;

    const firstVideoLayer = layersOut.find((layer) => layer.type === 'video');
    if (firstVideoLayer && !userClipDuration) clipDuration = firstVideoLayer.inputDuration;
    assert(clipDuration);

    // We need to map again, because for audio, we need to know the correct clipDuration
    layersOut = await pMap(layersOut, async (layerIn) => {
      const { type, path, stop, start = 0 } = layerIn;

      // This feature allows the user to show another layer overlayed (or replacing) parts of the lower layers (start - stop)
      const layerDuration = ((stop || clipDuration) - start);
      assert(layerDuration > 0 && layerDuration <= clipDuration, `Invalid start ${start} or stop ${stop} (${clipDuration})`);
      // TODO Also need to handle video layers (speedFactor etc)
      // TODO handle audio in case of start/stop

      const layer = { ...layerIn, start, layerDuration };

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

        const speedFactor = clipDuration / inputDuration;

        return { ...layer, cutFrom, cutTo, speedFactor };
      }

      if (type === 'video') {
        const { inputDuration } = layer;

        let speedFactor;

        // If user explicitly specified duration for clip, it means that should be the output duration of the video
        if (userClipDuration) {
          // Later we will speed up or slow down video using this factor
          speedFactor = userClipDuration / inputDuration;
        } else {
          speedFactor = 1;
        }

        return { ...layer, speedFactor };
      }

      // These audio tracks are detached from the clips (can run over multiple clips)
      // This is useful so we can have audio start relative to their parent clip's start time
      if (type === 'detached-audio') {
        const { cutFrom, cutTo, mixVolume } = layer;
        if (!detachedAudioByClip[clipIndex]) detachedAudioByClip[clipIndex] = [];
        detachedAudioByClip[clipIndex].push({ path, cutFrom, cutTo, mixVolume, start });
        return undefined; // Will be filtered out
      }

      return layer;
    });

    // Filter out deleted layers
    layersOut = layersOut.filter((l) => l);

    return {
      transition,
      duration: clipDuration,
      layers: layersOut,
    };
  }, { concurrency: 1 });

  let totalClipDuration = 0;
  const clipDetachedAudio = [];

  // Need to map again because now we know all clip durations, and we can adjust transitions so they are safe
  clipsOut = await pMap(clipsOut, async (clip, i) => {
    const nextClip = clipsOut[i + 1];

    // We clamp all transitions to half the length of every clip. If not, we risk that clips that are too short,
    // will be eaten by transitions and could cause de-sync issues with audio/video
    // NOTE: similar logic is duplicated in index.js
    let safeTransitionDuration = 0;
    if (nextClip) {
      // Each clip can have two transitions, make sure we leave enough room:
      safeTransitionDuration = Math.min(clip.duration / 2, nextClip.duration / 2, clip.transition.duration);
    }

    // We now know all clip durations so we can calculate the offset for detached audio tracks
    // eslint-disable-next-line no-restricted-syntax
    for (const { start, ...rest } of (detachedAudioByClip[i] || [])) {
      clipDetachedAudio.push({ ...rest, start: totalClipDuration + (start || 0) });
    }

    totalClipDuration += clip.duration - safeTransitionDuration;

    return {
      ...clip,
      transition: {
        ...clip.transition,
        duration: safeTransitionDuration,
      },
    };
  });

  // Audio can either come from `audioFilePath`, `audio` or from "detached" audio layers from clips
  const arbitraryAudio = [
    // Background audio is treated just like arbitrary audio
    ...(backgroundAudioPath ? [{ path: backgroundAudioPath, mixVolume: backgroundAudioVolume != null ? backgroundAudioVolume : 1, loop: loopAudio ? -1 : 0 }] : []),
    ...arbitraryAudioIn,
    ...clipDetachedAudio,
  ];

  await validateArbitraryAudio(arbitraryAudio, allowRemoteRequests);

  return {
    clips: clipsOut,
    arbitraryAudio,
  };
}
