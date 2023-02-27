import GL from 'gl';
import createShader from 'gl-shader';
import fsExtra from 'fs-extra';
import ndarray from 'ndarray';
import createTexture from 'gl-texture2d';

// I have no idea what I'm doing but it works ¯\_(ツ)_/¯

export default async function createGlFrameSource({ width, height, channels, params }) {
  const gl = GL(width, height);

  function convertFrame(buf) {
    // @see https://github.com/stackgl/gl-texture2d/issues/16
    return ndarray(buf, [width, height, channels], [channels, width * channels, 1]);
  }
  const defaultVertexSrc = `
    attribute vec2 position;
    void main(void) {
      gl_Position = vec4(position, 0.0, 1.0 );
    }
  `;
  const {
    vertexPath, fragmentPath,
    vertexSrc: vertexSrcIn, fragmentSrc: fragmentSrcIn,
    speed = 1,
    glParams = {}, glDefaultParams = {}, glParamsTypes = {},
  } = params;

  let fragmentSrc = fragmentSrcIn;
  let vertexSrc = vertexSrcIn;

  if (fragmentPath) fragmentSrc = await fsExtra.readFile(fragmentPath);
  if (vertexPath) vertexSrc = await fsExtra.readFile(vertexPath);

  if (!vertexSrc) vertexSrc = defaultVertexSrc;

  const shader = createShader(gl, vertexSrc, fragmentSrc);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  // https://blog.mayflower.de/4584-Playing-around-with-pixel-shaders-in-WebGL.html

  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);

  async function readNextFrame(progress, canvas, { bottomFrame } = {}) {
    shader.bind();

    shader.attributes.position.pointer();

    shader.uniforms.resolution = [width, height];
    shader.uniforms.time = progress * speed;
    if (bottomFrame) {
      const frameNdArray = convertFrame(bottomFrame);
      const texture = createTexture(gl, frameNdArray);
      texture.minFilter = gl.LINEAR;
      texture.magFilter = gl.LINEAR;
      shader.uniforms.txt = texture.bind(0);
      let unit = 1;
      // handle params like gl-transitions
      Object.keys(glParamsTypes)
        .forEach((key) => {
          const value = key in glParams
            ? glParams[key]
            : glDefaultParams[key];
          if (glParamsTypes[key] === 'sampler2D') {
            if (!value) {
              console.warn(
                `uniform[${
                  key
                }]: A texture MUST be defined for uniform sampler2D of a texture`,
              );
            } else if (typeof value.bind !== 'function') {
              throw new Error(
                `uniform[${
                  key
                }]: A gl-texture2d API-like object was expected`,
              );
            } else {
              shader.uniforms[key] = value.bind(unit);
              unit += 1;
            }
          } else {
            shader.uniforms[key] = value;
          }
        });
    }

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    const upsideDownArray = Buffer.allocUnsafe(width * height * channels);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, upsideDownArray);
    // const outArray = Buffer.allocUnsafe(width * height * channels);
    //
    // // Comes out upside down, flip it
    // for (let i = 0; i < outArray.length; i += 4) {
    //   outArray[i + 0] = upsideDownArray[outArray.length - i + 0];
    //   outArray[i + 1] = upsideDownArray[outArray.length - i + 1];
    //   outArray[i + 2] = upsideDownArray[outArray.length - i + 2];
    //   outArray[i + 3] = upsideDownArray[outArray.length - i + 3];
    // }
    return upsideDownArray;
  }

  return {
    readNextFrame,
    close: () => {},
  };
}
