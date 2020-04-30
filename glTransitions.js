const GL = require('gl');
const ndarray = require('ndarray');
const createBuffer = require('gl-buffer');
const transitions = require('gl-transitions');
const createTransition = require('gl-transition').default;
const createTexture = require('gl-texture2d');

module.exports = ({ width, height, channels }) => {
  const gl = GL(width, height);

  if (!gl) {
    throw new Error('gl returned null, this probably means that some dependencies are not installed. See README.');
  }

  function runTransitionOnFrame({ fromFrame, toFrame, progress, transitionName, transitionParams = {} }) {
    function convertFrame(buf) {
      // @see https://github.com/stackgl/gl-texture2d/issues/16
      return ndarray(buf, [width, height, channels], [channels, width * channels, 1]);
    }

    const buffer = createBuffer(gl,
      [-1, -1, -1, 4, 4, -1],
      gl.ARRAY_BUFFER,
      gl.STATIC_DRAW);

    let transition;

    try {
      const resizeMode = 'stretch';

      const transitionSource = transitions.find((t) => t.name.toLowerCase() === transitionName.toLowerCase());

      transition = createTransition(gl, transitionSource, { resizeMode });

      gl.clear(gl.COLOR_BUFFER_BIT);

      // console.time('runTransitionOnFrame internal');
      const fromFrameNdArray = convertFrame(fromFrame);
      const textureFrom = createTexture(gl, fromFrameNdArray);
      textureFrom.minFilter = gl.LINEAR;
      textureFrom.magFilter = gl.LINEAR;

      // console.timeLog('runTransitionOnFrame internal');
      const toFrameNdArray = convertFrame(toFrame);
      const textureTo = createTexture(gl, toFrameNdArray);
      textureTo.minFilter = gl.LINEAR;
      textureTo.magFilter = gl.LINEAR;

      buffer.bind();
      transition.draw(progress, textureFrom, textureTo, gl.drawingBufferWidth, gl.drawingBufferHeight, transitionParams);

      textureFrom.dispose();
      textureTo.dispose();

      // console.timeLog('runTransitionOnFrame internal');

      const outArray = Buffer.allocUnsafe(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, outArray);

      // console.timeEnd('runTransitionOnFrame internal');

      return outArray;

      // require('fs').writeFileSync(`${new Date().getTime()}.raw`, outArray);
      // Testing: ffmpeg -f rawvideo -vcodec rawvideo -pix_fmt rgba -s 2166x1650 -i 1586619627191.raw -vf format=yuv420p -vcodec libx264 -y out.mp4
    } finally {
      buffer.dispose();
      if (transition) transition.dispose();
    }
  }

  return {
    runTransitionOnFrame,
  };
};
