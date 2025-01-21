import pMap from 'p-map';
import { basename, join } from 'path';
import flatMap from 'lodash-es/flatMap.js';
import assert from 'assert';
import { fileURLToPath } from 'url';
import { assertFileValid, checkTransition } from './util.js';
import { readVideoFileInfo, readDuration } from './ffmpeg.js';
import { registerFont } from 'canvas';
import { calcTransition, type CalculatedTransition } from './transitions.js';
import type { AudioTrack, CanvasLayer, EditlyBannerLayer, FabricLayer, GlLayer, ImageLayer, ImageOverlayLayer, Layer, LinearGradientLayer, NewsTitleLayer, SlideInTextLayer, SubtitleLayer, TitleBackgroundLayer, TitleLayer, DefaultOptions, Clip, VideoLayer } from './types.js';

export type ProcessedClip = {
  layers: Layer[];
  duration: number;
  transition: CalculatedTransition;
}

const dirname = fileURLToPath(new URL('..', import.meta.url));

// Cache
const loadedFonts: string[] = [];

async function validateArbitraryAudio(audio: AudioTrack[] | undefined, allowRemoteRequests?: boolean) {
  assert(audio === undefined || Array.isArray(audio));

  if (audio) {
    for (const { path, cutFrom, cutTo, start } of audio) {
      await assertFileValid(path, allowRemoteRequests);

      if (cutFrom != null && cutTo != null) assert(cutTo > cutFrom);
      if (cutFrom != null) assert(cutFrom >= 0);
      if (cutTo != null) assert(cutTo >= 0);
      assert(start == null || start >= 0, `Invalid "start" ${start}`);
    }
  }
}

type ParseConfigOptions = {
  defaults: DefaultOptions;
  clips: Clip[];
  backgroundAudioVolume?: string | number;
  backgroundAudioPath?: string;
  loopAudio?: boolean;
  allowRemoteRequests?: boolean;
  arbitraryAudio: AudioTrack[];
};

export default async function parseConfig({ defaults: defaultsIn = {}, clips, arbitraryAudio: arbitraryAudioIn, backgroundAudioPath, backgroundAudioVolume, loopAudio, allowRemoteRequests }: ParseConfigOptions) {
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

  async function handleLayer(layer: Layer): Promise<Layer | Layer[]> {
    // https://github.com/mifi/editly/issues/39
    if (layer.type === 'image' || layer.type === 'image-overlay') {
      await assertFileValid((layer as (ImageOverlayLayer | ImageLayer)).path, allowRemoteRequests);
    } else if (layer.type === 'gl') {
      await assertFileValid(layer.fragmentPath, allowRemoteRequests);
    }

    if (['fabric', 'canvas'].includes(layer.type)) {
      assert(typeof (layer as FabricLayer | CanvasLayer).func === 'function', '"func" must be a function');
    }

    if (['image', 'image-overlay', 'fabric', 'canvas', 'gl', 'radial-gradient', 'linear-gradient', 'fill-color'].includes(layer.type)) {
      return layer;
    }

    // TODO if random-background radial-gradient linear etc
    if (layer.type === 'pause') {
      return handleLayer({ ...layer, type: 'fill-color' });
    }

    if (layer.type === 'rainbow-colors') {
      return handleLayer({ type: 'gl', fragmentPath: join(dirname, 'shaders/rainbow-colors.frag') } as GlLayer);
    }

    if (layer.type === 'editly-banner') {
      const { fontPath } = layer as EditlyBannerLayer;
      return [
        await handleLayer({ type: 'linear-gradient' } as LinearGradientLayer),
        await handleLayer({ type: 'title', text: 'Made with\nEDITLY\nmifi.no', fontPath } as TitleLayer),
      ].flat();
    }

    // For convenience
    if (layer.type === 'title-background') {
      const { text, textColor, background, fontFamily, fontPath } = layer as TitleBackgroundLayer;
      const outLayers = [];
      if (background) {
        if (background.type === 'radial-gradient') outLayers.push(await handleLayer({ type: 'radial-gradient', colors: background.colors }));
        else if (background.type === 'linear-gradient') outLayers.push(await handleLayer({ type: 'linear-gradient', colors: background.colors }));
        else if (background.color) outLayers.push(await handleLayer({ type: 'fill-color', color: background.color }));
      } else {
        const backgroundTypes: ('radial-gradient' | 'linear-gradient' | 'fill-color')[] = ['radial-gradient', 'linear-gradient', 'fill-color'];
        const randomType = backgroundTypes[Math.floor(Math.random() * backgroundTypes.length)];
        outLayers.push(await handleLayer({ type: randomType }));
      }
      outLayers.push(await handleLayer({ type: 'title', fontFamily, fontPath, text, textColor }));
      return outLayers.flat();
    }

    if (['title', 'subtitle', 'news-title', 'slide-in-text'].includes(layer.type)) {
      const { fontPath, ...rest } = layer as TitleLayer | SubtitleLayer | NewsTitleLayer | SlideInTextLayer;
      assert(rest.text, 'Please specify a text');

      let { fontFamily } = rest;
      if (fontPath) {
        fontFamily = Buffer.from(basename(fontPath)).toString('base64');
        if (!loadedFonts.includes(fontFamily)) {
          registerFont(fontPath, { family: fontFamily, weight: 'regular', style: 'normal' });
          loadedFonts.push(fontFamily);
        }
      }
      return { ...rest, fontFamily };
    }

    throw new Error(`Invalid layer type ${layer.type}`);
  }

  const detachedAudioByClip: Record<number, AudioTrack[]> = {};

  let clipsOut: ProcessedClip[] = await pMap(clips, async (clip, clipIndex) => {
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

    const transition = calcTransition(defaults.transition, userTransition, clipIndex === clips.length - 1);

    let layersOut = flatMap(await pMap(layers, async <T extends Layer>(layerIn: T) => {
      const globalLayerDefaults = defaults.layer || {};
      const thisLayerDefaults = (defaults.layerType || {})[layerIn.type];

      const layer: T = { ...globalLayerDefaults, ...thisLayerDefaults, ...layerIn };

      if (layer.type === 'video') {
        const { duration: fileDuration, width: widthIn, height: heightIn, framerateStr, rotation } = await readVideoFileInfo(layer.path);
        let { cutFrom, cutTo } = layer;
        if (!cutFrom) cutFrom = 0;
        cutFrom = Math.max(cutFrom, 0);
        cutFrom = Math.min(cutFrom, fileDuration);

        if (!cutTo) cutTo = fileDuration;
        cutTo = Math.max(cutTo, cutFrom);
        cutTo = Math.min(cutTo, fileDuration);
        assert(cutFrom < cutTo, 'cutFrom must be lower than cutTo');

        const layerDuration = cutTo - cutFrom;

        const isRotated = rotation && [-90, 90, 270, -270].includes(rotation);
        const inputWidth = isRotated ? heightIn : widthIn;
        const inputHeight = isRotated ? widthIn : heightIn;

        return { ...layer, cutFrom, cutTo, layerDuration, framerateStr, inputWidth, inputHeight } as T;
      }

      // Audio is handled later
      if (['audio', 'detached-audio'].includes(layer.type)) return layer;

      return handleLayer(layer);
    }, { concurrency: 1 }));

    let clipDuration = userClipDurationOrDefault;

    const firstVideoLayer = layersOut.find((layer): layer is VideoLayer => layer.type === 'video');
    if (firstVideoLayer && !userClipDuration) clipDuration = firstVideoLayer.layerDuration!;
    assert(clipDuration);

    // We need to map again, because for audio, we need to know the correct clipDuration
    layersOut = (await pMap(layersOut, async <T extends Layer>(layerIn: T) => {
      if (!layerIn.start) layerIn.start = 0

      // This feature allows the user to show another layer overlayed (or replacing) parts of the lower layers (start - stop)
      const layerDuration = ((layerIn.stop || clipDuration) - layerIn.start);
      assert(layerDuration > 0 && layerDuration <= clipDuration, `Invalid start ${layerIn.start} or stop ${layerIn.stop} (${clipDuration})`);
      // TODO Also need to handle video layers (speedFactor etc)
      // TODO handle audio in case of start/stop

      const layer: T = { ...layerIn, layerDuration };

      if (layer.type === 'audio') {
        const fileDuration = await readDuration(layer.path);
        let { cutFrom, cutTo } = layer;

        // console.log({ cutFrom, cutTo, fileDuration, clipDuration });

        if (!cutFrom) cutFrom = 0;
        cutFrom = Math.max(cutFrom, 0);
        cutFrom = Math.min(cutFrom, fileDuration);

        if (!cutTo) cutTo = cutFrom + clipDuration;
        cutTo = Math.max(cutTo, cutFrom);
        cutTo = Math.min(cutTo, fileDuration);
        assert(cutFrom < cutTo, 'cutFrom must be lower than cutTo');

        const layerDuration = cutTo - cutFrom;

        const speedFactor = clipDuration / layerDuration;

        return { ...layer, cutFrom, cutTo, speedFactor };
      }

      if (layer.type === 'video') {
        let speedFactor;

        // If user explicitly specified duration for clip, it means that should be the output duration of the video
        if (userClipDuration) {
          // Later we will speed up or slow down video using this factor
          speedFactor = userClipDuration / layerDuration;
        } else {
          speedFactor = 1;
        }

        return { ...layer, speedFactor };
      }

      // These audio tracks are detached from the clips (can run over multiple clips)
      // This is useful so we can have audio start relative to their parent clip's start time
      if (layer.type === 'detached-audio') {
        if (!detachedAudioByClip[clipIndex]) detachedAudioByClip[clipIndex] = [];
        detachedAudioByClip[clipIndex].push(layer);
        return undefined; // Will be filtered out
      }

      return layer;
    })).filter((l) => l !== undefined);

    // Filter out deleted layers
    layersOut = layersOut.filter((l) => l);

    return {
      transition,
      duration: clipDuration,
      layers: layersOut,
    };
  }, { concurrency: 1 });

  let totalClipDuration = 0;
  const clipDetachedAudio: AudioTrack[] = [];

  // Need to map again because now we know all clip durations, and we can adjust transitions so they are safe
  clipsOut = await pMap(clipsOut, async (clip, i) => {
    const nextClip = clipsOut[i + 1];

    // We clamp all transitions to half the length of every clip. If not, we risk that clips that are too short,
    // will be eaten by transitions and could cause de-sync issues with audio/video
    // NOTE: similar logic is duplicated in index.js
    let safeTransitionDuration = 0;
    if (nextClip) {
      // Each clip can have two transitions, make sure we leave enough room:
      safeTransitionDuration = Math.min(clip.duration / 2, nextClip.duration / 2, clip.transition!.duration!);
    }

    // We now know all clip durations so we can calculate the offset for detached audio tracks
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
