const assert = require('assert');
const pMap = require('p-map');

const { mergeFrames, customFabricFrameSource, createCustomCanvasFrameSource, titleFrameSource, subtitleFrameSource, imageFrameSource, linearGradientFrameSource, radialGradientFrameSource, fillColorFrameSource, createFabricFrameSource } = require('./fabricFrameSource');
const createVideoFrameSource = require('./videoFrameSource');
const { createGlFrameSource } = require('./glFrameSource');


async function createFrameSource({ clip, clipIndex, width, height, channels, verbose, ffmpegPath, enableFfmpegLog, framerateStr }) {
  const { layers, duration } = clip;

  const frameSources = await pMap(layers, async (layer, layerIndex) => {
    const { type, ...params } = layer;
    console.log('createFrameSource', type, 'clip', clipIndex, 'layer', layerIndex);

    const frameSourceFuncs = {
      video: createVideoFrameSource,
      gl: createGlFrameSource,
      canvas: createCustomCanvasFrameSource,
      fabric: async (opts) => createFabricFrameSource(customFabricFrameSource, opts),
      image: async (opts) => createFabricFrameSource(imageFrameSource, opts),
      title: async (opts) => createFabricFrameSource(titleFrameSource, opts),
      subtitle: async (opts) => createFabricFrameSource(subtitleFrameSource, opts),
      'linear-gradient': async (opts) => createFabricFrameSource(linearGradientFrameSource, opts),
      'radial-gradient': async (opts) => createFabricFrameSource(radialGradientFrameSource, opts),
      'fill-color': async (opts) => createFabricFrameSource(fillColorFrameSource, opts),
    };
    assert(frameSourceFuncs[type], `Invalid type ${type}`);

    const createFrameSourceFunc = frameSourceFuncs[type];

    return createFrameSourceFunc({ ffmpegPath, width, height, duration, channels, verbose, enableFfmpegLog, framerateStr, params });
  }, { concurrency: 1 });

  async function readNextFrame(...args) {
    const framesRaw = await pMap(frameSources, async (frameSource) => frameSource.readNextFrame(...args));
    // if (verbose) console.time('Merge frames');

    const framesRawFiltered = framesRaw.filter((frameRaw) => {
      if (frameRaw) return true;
      console.warn('Frame source returned empty result');
      return false;
    });
    const merged = mergeFrames({ width, height, framesRaw: framesRawFiltered });
    // if (verbose) console.timeEnd('Merge frames');
    return merged;
  }

  async function close() {
    await pMap(frameSources, async (frameSource) => frameSource.close());
  }

  return {
    readNextFrame,
    close,
  };
}

module.exports = {
  createFrameSource,
};
