import editly from '../index.js';

// See https://github.com/mifi/editly/pull/222

editly({
  outPath: './fabricImagePostProcessing.mp4',
  clips: [{
    duration: 4,
    layers: [
      { type: 'video', path: './assets/lofoten.mp4', cutFrom: 0, cutTo: 4 },
      {
        type: 'video',
        path: './assets/hiking.mp4',
        cutFrom: 0,
        cutTo: 4,
        resizeMode: 'cover',
        originX: 'center',
        originY: 'center',
        left: 0.5,
        top: 0.5,
        width: 0.5,
        height: 0.5,
        fabricImagePostProcessing: async ({ image, fabric, canvas }) => {
          const circleArgs = {
            radius: Math.min(image.width, image.height) * 0.4,
            originX: 'center',
            originY: 'center',
            stroke: 'white',
            strokeWidth: 22,
          };
          image.setOptions({ clipPath: new fabric.Circle(circleArgs) });
          canvas.add(new fabric.Circle({
            ...circleArgs,
            left: image.getCenterPoint().x,
            top: image.getCenterPoint().y,
          }));
        },
      },
    ] },
  ],
}).catch(console.error);
