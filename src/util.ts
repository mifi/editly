import assert from 'assert';
import { sortBy } from 'lodash-es';
import { pathExists } from 'fs-extra';

import type { Keyframe } from './types.js';
import type { Position, PositionObject, Transition } from './types.js';
import type { TOriginX, TOriginY } from 'fabric';

export function toArrayInteger(buffer: Buffer) {
  if (buffer.length > 0) {
    const data = new Uint8ClampedArray(buffer.length);
    for (let i = 0; i < buffer.length; i += 1) {
      data[i] = buffer[i];
    }
    return data;
  }
  return [];
}

// x264 requires multiple of 2
export const multipleOf2 = (x: number) => Math.round(x / 2) * 2;

export function getPositionProps({ position, width, height }: { position?: Position | PositionObject, width: number, height: number }) {
  let originY: TOriginY = 'center';
  let originX: TOriginX = 'center';
  let top = height / 2;
  let left = width / 2;
  const margin = 0.05;

  if (typeof position === 'string') {
    if (position === 'top') {
      originY = 'top';
      top = height * margin;
    } else if (position === 'bottom') {
      originY = 'bottom';
      top = height * (1 - margin);
    } else if (position === 'center') {
      originY = 'center';
      top = height / 2;
    } else if (position === 'top-left') {
      originX = 'left';
      originY = 'top';
      left = width * margin;
      top = height * margin;
    } else if (position === 'top-right') {
      originX = 'right';
      originY = 'top';
      left = width * (1 - margin);
      top = height * margin;
    } else if (position === 'center-left') {
      originX = 'left';
      originY = 'center';
      left = width * margin;
      top = height / 2;
    } else if (position === 'center-right') {
      originX = 'right';
      originY = 'center';
      left = width * (1 - margin);
      top = height / 2;
    } else if (position === 'bottom-left') {
      originX = 'left';
      originY = 'bottom';
      left = width * margin;
      top = height * (1 - margin);
    } else if (position === 'bottom-right') {
      originX = 'right';
      originY = 'bottom';
      left = width * (1 - margin);
      top = height * (1 - margin);
    }
  } else {
    if (position?.x != null) {
      originX = position.originX || 'left';
      left = width * position.x;
    }
    if (position?.y != null) {
      originY = position.originY || 'top';
      top = height * position.y;
    }
  }

  return { originX, originY, top, left };
}

export function getFrameByKeyFrames(keyframes: Keyframe[], progress: number) {
  if (keyframes.length < 2) throw new Error('Keyframes must be at least 2');
  const sortedKeyframes = sortBy(keyframes, 't');

  // TODO check that max is 1
  // TODO check that all keyframes have all props
  // TODO make smarter so user doesn't need to replicate non-changing props

  const invalidKeyframe = sortedKeyframes.find((k, i) => {
    if (i === 0) return false;
    return k.t === sortedKeyframes[i - 1].t;
  });
  if (invalidKeyframe) throw new Error('Invalid keyframe');

  let prevKeyframe = [...sortedKeyframes].reverse().find((k) => k.t < progress);
  if (!prevKeyframe) prevKeyframe = sortedKeyframes[0];

  let nextKeyframe = sortedKeyframes.find((k) => k.t >= progress);
  if (!nextKeyframe) nextKeyframe = sortedKeyframes[sortedKeyframes.length - 1];

  if (nextKeyframe.t === prevKeyframe.t) return prevKeyframe.props;

  const interProgress = (progress - prevKeyframe.t) / (nextKeyframe.t - prevKeyframe.t);
  return Object.fromEntries(Object.entries(prevKeyframe.props).map(([propName, prevVal]) => ([propName, prevVal + ((nextKeyframe.props[propName] - prevVal) * interProgress)])));
}

export const isUrl = (path: string) => /^https?:\/\//.test(path);

export const assertFileValid = async (path: string, allowRemoteRequests?: boolean) => {
  if (isUrl(path)) {
    assert(allowRemoteRequests, 'Remote requests are not allowed');
    return;
  }
  assert(await pathExists(path), `File does not exist ${path}`);
};

// See #16
export function checkTransition(transition?: Transition | null) {
  assert(transition == null || typeof transition === 'object', 'Transition must be an object');
}
