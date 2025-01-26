import editly from "editly";

// See https://github.com/mifi/editly/pull/222

await editly({
  outPath: "./fabricImagePostProcessing.mp4",
  clips: [
    {
      duration: 4,
      layers: [
        { type: "video", path: "./assets/kohlipe1.mp4", cutFrom: 0, cutTo: 4 },
        {
          type: "video",
          path: "./assets/kohlipe2.mp4",
          cutFrom: 0,
          cutTo: 4,
          resizeMode: "cover",
          originX: "center",
          originY: "center",
          left: 0.5,
          top: 0.5,
          width: 0.5,
          height: 0.5,
          fabricImagePostProcessing: async ({ image, fabric, canvas }) => {
            const circleArgs: ConstructorParameters<typeof fabric.Circle>[0] = {
              radius: Math.min(image.width, image.height) * 0.4,
              originX: "center",
              originY: "center",
              stroke: "white",
              strokeWidth: 22,
            };
            image.set({ clipPath: new fabric.Circle(circleArgs) });
            canvas.add(
              new fabric.Circle({
                ...circleArgs,
                left: image.getCenterPoint().x,
                top: image.getCenterPoint().y,
              }),
            );
          },
        },
      ],
    },
  ],
});
