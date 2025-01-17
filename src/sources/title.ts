import { Textbox } from 'fabric/node';
import type { TitleLayer } from '../types.js';
import { getPositionProps } from '../util.js';
import { defaultFontFamily, getZoomParams, getTranslationParams } from '../util.js';
import { defineFrameSource } from '../api//index.js';

export default defineFrameSource<TitleLayer>('title', async ({ width, height, params }) => {
  const { text, textColor = '#ffffff', fontFamily = defaultFontFamily, position = 'center', zoomDirection = 'in', zoomAmount = 0.2 } = params;
  const fontSize = Math.round(Math.min(width, height) * 0.1);

  const textBox = new Textbox(text, {
    fill: textColor,
    fontFamily,
    fontSize,
    textAlign: 'center',
    width: width * 0.8,
  });

  return {
    async readNextFrame(progress, canvas) {
      const scaleFactor = getZoomParams({ progress, zoomDirection, zoomAmount });
      const translationParams = getTranslationParams({ progress, zoomDirection, zoomAmount });

      // We need the text as an image in order to scale it
      const textImage = textBox.cloneAsImage({});

      const { left, top, originX, originY } = getPositionProps({ position, width, height });

      textImage.set({
        originX,
        originY,
        left: left + translationParams,
        top,
        scaleX: scaleFactor,
        scaleY: scaleFactor,
      });

      canvas.add(textImage);
    }
  };
});
