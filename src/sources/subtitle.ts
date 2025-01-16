import { Rect, Textbox } from 'fabric/node';
import { easeOutExpo } from '../transitions.js';
import type { SubtitleLayer } from '../types.js';
import { defaultFontFamily } from '../util.js';
import { defineFrameSource } from './index.js';

export default defineFrameSource<SubtitleLayer>(async ({ width, height, params }) => {
  const { text, textColor = '#ffffff', backgroundColor = 'rgba(0,0,0,0.3)', fontFamily = defaultFontFamily, delay = 0, speed = 1 } = params;

  return {
    async readNextFrame(progress, canvas) {
      const easedProgress = easeOutExpo(Math.max(0, Math.min((progress - delay) * speed, 1)));

      const min = Math.min(width, height);
      const padding = 0.05 * min;

      const textBox = new Textbox(text, {
        fill: textColor,
        fontFamily,

        fontSize: min / 20,
        textAlign: 'left',
        width: width - padding * 2,
        originX: 'center',
        originY: 'bottom',
        left: (width / 2) + (-1 + easedProgress) * padding,
        top: height - padding,
        opacity: easedProgress,
      });

      const rect = new Rect({
        left: 0,
        width,
        height: textBox.height + padding * 2,
        top: height,
        originY: 'bottom',
        fill: backgroundColor,
        opacity: easedProgress,
      });

      canvas.add(rect);
      canvas.add(textBox);
    }
  }
});
