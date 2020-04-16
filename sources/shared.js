function canvasToRgba(ctx) {
  // const bgra = canvas.toBuffer('raw');

  /* const rgba = Buffer.allocUnsafe(bgra.length);
  for (let i = 0; i < bgra.length; i += 4) {
    rgba[i + 0] = bgra[i + 2];
    rgba[i + 1] = bgra[i + 1];
    rgba[i + 2] = bgra[i + 0];
    rgba[i + 3] = bgra[i + 3];
  } */

  // We cannot use toBuffer('raw') because it returns pre-multiplied alpha data (a different format)
  // https://gamedev.stackexchange.com/questions/138813/whats-the-difference-between-alpha-and-premulalpha
  // https://github.com/Automattic/node-canvas#image-pixel-formats-experimental
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  return Buffer.from(imageData.data);
}

module.exports = {
  canvasToRgba,
};
