const assert = require('assert');
const pMap = require('p-map');

const { rgbaToFabricImage, createCustomCanvasFrameSource, createFabricFrameSource, createFabricCanvas, renderFabricCanvas } = require('./fabric');

const { customFabricFrameSource, subtitleFrameSource, titleFrameSource, newsTitleFrameSource, fillColorFrameSource, radialGradientFrameSource, linearGradientFrameSource, imageFrameSource, imageOverlayFrameSource } = require('./fabric/fabricFrameSources');

const createVideoFrameSource = require('./videoFrameSource');
const { createGlFrameSource } = require('./glFrameSource');

const fabricFrameSources = {
  fabric: customFabricFrameSource,
  image: imageFrameSource,
  'image-overlay': imageOverlayFrameSource,
  title: titleFrameSource,
  subtitle: subtitleFrameSource,
  'linear-gradient': linearGradientFrameSource,
  'radial-gradient': radialGradientFrameSource,
  'fill-color': fillColorFrameSource,
  'news-title': newsTitleFrameSource,
};

async function createFrameSource({ clip, clipIndex, width, height, channels, verbose, ffmpegPath, ffprobePath, enableFfmpegLog, framerateStr }) {
  const { layers, duration } = clip;

  const visualLayers = layers.filter((layer) => layer.type !== 'audio');

  const layerFrameSources = await pMap(visualLayers, async (layer, layerIndex) => {
    const { type, ...params } = layer;
    console.log('createFrameSource', type, 'clip', clipIndex, 'layer', layerIndex);

    let createFrameSourceFunc;
    if (fabricFrameSources[type]) {
      createFrameSourceFunc = async (opts) => createFabricFrameSource(fabricFrameSources[type], opts);
    } else {
      createFrameSourceFunc = {
        video: createVideoFrameSource,
        gl: createGlFrameSource,
        canvas: createCustomCanvasFrameSource,
      }[type];
    }

    assert(createFrameSourceFunc, `Invalid type ${type}`);

    const frameSource = await createFrameSourceFunc({ ffmpegPath, ffprobePath, width, height, duration, channels, verbose, enableFfmpegLog, framerateStr, params });
    return { layer, frameSource };
  }, { concurrency: 1 });

  async function readNextFrame({ time }) {
    const canvas = createFabricCanvas({ width, height });

    // eslint-disable-next-line no-restricted-syntax
    for (const { frameSource, layer } of layerFrameSources) {
      // console.log({ visibleFrom: layer.visibleFrom, visibleUntil: layer.visibleUntil, visibleDuration: layer.visibleDuration, time });
      const offsetProgress = (time - (layer.visibleFrom)) / layer.visibleDuration;
      // console.log({ offsetProgress });
      const shouldDrawLayer = offsetProgress >= 0 && offsetProgress <= 1;

      if (shouldDrawLayer) {
        const rgba = await frameSource.readNextFrame(offsetProgress, canvas);
        // Frame sources can either render to the provided canvas and return nothing
        // OR return an raw RGBA blob which will be drawn onto the canvas
        if (rgba) {
          // Optimization: Don't need to draw to canvas if there's only one layer
          if (layerFrameSources.length === 1) return rgba;

          const img = await rgbaToFabricImage({ width, height, rgba });
          canvas.add(img);
        } else {
          // Assume this frame source has drawn its content to the canvas
        }
      }
    }
    // if (verbose) console.time('Merge frames');

    return renderFabricCanvas(canvas);
  }

  async function close() {
    await pMap(layerFrameSources, async ({ frameSource }) => frameSource.close());
  }

  return {
    readNextFrame,
    close,
  };
}

module.exports = {
  createFrameSource,
};
