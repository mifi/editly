import assert from 'assert';
import pMap from 'p-map';

import {
  rgbaToFabricImage,
  createCustomCanvasFrameSource,
  createFabricFrameSource,
  createFabricCanvas,
  renderFabricCanvas,
  type FabricFrameSourceCallback,
} from './fabric.js';
import {
  customFabricFrameSource,
  subtitleFrameSource,
  titleFrameSource,
  newsTitleFrameSource,
  fillColorFrameSource,
  radialGradientFrameSource,
  linearGradientFrameSource,
  imageFrameSource,
  imageOverlayFrameSource,
  slideInTextFrameSource,
} from './fabric/fabricFrameSources.js';
import createVideoFrameSource from './videoFrameSource.js';
import createGlFrameSource from './glFrameSource.js';
import type { CreateFrameSource, CreateFrameSourceOptions, DebugOptions } from '../types.js';
import { ProcessedClip } from '../parseConfig.js';

const fabricFrameSources: Record<string, FabricFrameSourceCallback<any /* FIXME[ts] */>> = {
  fabric: customFabricFrameSource,
  image: imageFrameSource,
  'image-overlay': imageOverlayFrameSource,
  title: titleFrameSource,
  subtitle: subtitleFrameSource,
  'linear-gradient': linearGradientFrameSource,
  'radial-gradient': radialGradientFrameSource,
  'fill-color': fillColorFrameSource,
  'news-title': newsTitleFrameSource,
  'slide-in-text': slideInTextFrameSource,
};

const frameSources: Record<string, CreateFrameSource<any>> = {
  video: createVideoFrameSource,
  gl: createGlFrameSource,
  canvas: createCustomCanvasFrameSource,
};

type FrameSourceOptions = DebugOptions & {
  clip: ProcessedClip;
  clipIndex: number;
  ffmpegPath: string;
  ffprobePath: string;
  width: number,
  height: number,
  channels: number,
  framerateStr: string,
}

export async function createFrameSource({ clip, clipIndex, width, height, channels, verbose, logTimes, ffmpegPath, ffprobePath, enableFfmpegLog, framerateStr }: FrameSourceOptions) {
  const { layers, duration } = clip;

  const visualLayers = layers.filter((layer) => layer.type !== 'audio');

  const layerFrameSources = await pMap(visualLayers, async (layer, layerIndex) => {
    const { type, ...params } = layer;
    if (verbose) console.log('createFrameSource', type, 'clip', clipIndex, 'layer', layerIndex);

    let createFrameSourceFunc: CreateFrameSource<typeof layer>;
    if (fabricFrameSources[type]) {
      createFrameSourceFunc = async (opts: CreateFrameSourceOptions<any>) => createFabricFrameSource(fabricFrameSources[type], opts);
    } else {
      createFrameSourceFunc = frameSources[type];
    }

    assert(createFrameSourceFunc, `Invalid type ${type}`);

    const frameSource = await createFrameSourceFunc({ ffmpegPath, ffprobePath, width, height, duration, channels, verbose, logTimes, enableFfmpegLog, framerateStr, params });
    return { layer, frameSource };
  }, { concurrency: 1 });

  async function readNextFrame({ time }: { time: number }) {
    const canvas = createFabricCanvas({ width, height });

    // eslint-disable-next-line no-restricted-syntax
    for (const { frameSource, layer } of layerFrameSources) {
      // console.log({ start: layer.start, stop: layer.stop, layerDuration: layer.layerDuration, time });
      const offsetTime = time - (layer?.start ?? 0);
      const offsetProgress = offsetTime / layer.layerDuration!;
      // console.log({ offsetProgress });
      const shouldDrawLayer = offsetProgress >= 0 && offsetProgress <= 1;

      if (shouldDrawLayer) {
        if (logTimes) console.time('frameSource.readNextFrame');
        const rgba = await frameSource.readNextFrame(offsetProgress, canvas, offsetTime);
        if (logTimes) console.timeEnd('frameSource.readNextFrame');

        // Frame sources can either render to the provided canvas and return nothing
        // OR return an raw RGBA blob which will be drawn onto the canvas
        if (rgba) {
          // Optimization: Don't need to draw to canvas if there's only one layer
          if (layerFrameSources.length === 1) return rgba;

          if (logTimes) console.time('rgbaToFabricImage');
          const img = await rgbaToFabricImage({ width, height, rgba });
          if (logTimes) console.timeEnd('rgbaToFabricImage');
          canvas.add(img);
        } else {
          // Assume this frame source has drawn its content to the canvas
        }
      }
    }
    // if (verbose) console.time('Merge frames');

    if (logTimes) console.time('renderFabricCanvas');
    const rgba = await renderFabricCanvas(canvas);
    if (logTimes) console.timeEnd('renderFabricCanvas');
    return rgba;
  }

  async function close() {
    await pMap(layerFrameSources, async ({ frameSource }) => frameSource.close?.());
  }

  return {
    readNextFrame,
    close,
  };
}

export default {
  createFrameSource,
};
