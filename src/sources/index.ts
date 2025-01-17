import assert from 'assert';

import canvas from './canvas.js';
import fabric from './fabric.js';
import fillColor from './fill-color.js';
import gl from './gl.js';
import imageOverlay from './image-overlay.js';
import image from './image.js';
import linearGradient from './linear-gradient.js';
import newsTitle from './news-title.js';
import radialGradient from './radial-gradient.js';
import slideInText from './slide-in-text.js';
import subtitle from './subtitle.js';
import title from './title.js';
import video from './video.js';

import type { CreateFrameSourceOptions, FrameSourceFactory } from '../api/index.js';
import { BaseLayer } from '../types.js';

const sources = [
  canvas,
  fabric,
  fillColor,
  gl,
  imageOverlay,
  image,
  linearGradient,
  newsTitle,
  radialGradient,
  slideInText,
  subtitle,
  title,
  video,
];

export async function createLayerSource<T extends BaseLayer>(options: CreateFrameSourceOptions<T>) {
  const layer = options.params;
  const source = sources.find(({ type }) => type == layer.type) as FrameSourceFactory<T> | undefined;
  assert(source, `Invalid type ${layer.type}`);
  return await source.setup(options);
}

export default sources;
