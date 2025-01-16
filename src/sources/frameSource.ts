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
  titleFrameSource,
  newsTitleFrameSource,
  slideInTextFrameSource,
} from './fabricFrameSources.js';

import fillColorFrameSource from './fill-color.js';
import glFrameSource from './gl.js';
import imageFrameSource from './image.js';
import imageOverlayFrameSource from './image-overlay.js';
import linearGradientFrameSource from './linear-gradient.js';
import radialGradientFrameSource from './radial-gradient.js';
import subtitleFrameSource from './subtitle.js';
import videoFrameSource from './video.js';

import type { CreateFrameSource, CreateFrameSourceOptions, DebugOptions } from '../types.js';
import { ProcessedClip } from '../parseConfig.js';

// FIXME[ts]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fabricFrameSources: Record<string, FabricFrameSourceCallback<any>> = {
  fabric: customFabricFrameSource,
  title: titleFrameSource,
  'news-title': newsTitleFrameSource,
  'slide-in-text': slideInTextFrameSource,
};

// FIXME[ts]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const frameSources: Record<string, CreateFrameSource<any>> = {
  'fill-color': fillColorFrameSource,
  'image-overlay': imageOverlayFrameSource,
  'linear-gradient': linearGradientFrameSource,
  'radial-gradient': radialGradientFrameSource,
  canvas: createCustomCanvasFrameSource,
  gl: glFrameSource,
  image: imageFrameSource,
  subtitle: subtitleFrameSource,
  video: videoFrameSource,
};

type FrameSourceOptions = DebugOptions & {
  clip: ProcessedClip;
  clipIndex: number;
  width: number,
  height: number,
  channels: number,
  framerateStr: string,
}

export async function createFrameSource({ clip, clipIndex, width, height, channels, verbose, logTimes, framerateStr }: FrameSourceOptions) {
  const { layers, duration } = clip;

  const visualLayers = layers.filter((layer) => layer.type !== 'audio');

  const layerFrameSources = await pMap(visualLayers, async (layer, layerIndex) => {
    const { type, ...params } = layer;
    if (verbose) console.log('createFrameSource', type, 'clip', clipIndex, 'layer', layerIndex);

    let createFrameSourceFunc: CreateFrameSource<typeof layer>;
    if (fabricFrameSources[type]) {
      // FIXME[TS]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createFrameSourceFunc = async (opts: CreateFrameSourceOptions<any>) => createFabricFrameSource(fabricFrameSources[type], opts);
    } else {
      createFrameSourceFunc = frameSources[type];
    }

    assert(createFrameSourceFunc, `Invalid type ${type}`);

    const frameSource = await createFrameSourceFunc({ width, height, duration, channels, verbose, logTimes, framerateStr, params });
    return { layer, frameSource };
  }, { concurrency: 1 });

  async function readNextFrame({ time }: { time: number }) {
    const canvas = createFabricCanvas({ width, height });


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
