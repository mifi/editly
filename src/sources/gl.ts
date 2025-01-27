import GL from "gl";
import createShader from "gl-shader";
import { readFile } from "node:fs/promises";
import { defineFrameSource } from "../api/index.js";
import type { GlLayer } from "../types.js";

// I have no idea what I'm doing but it works ¯\_(ツ)_/¯

export default defineFrameSource<GlLayer>("gl", async ({ width, height, channels, params }) => {
  const gl = GL(width, height);

  const defaultVertexSrc = `
    attribute vec2 position;
    void main(void) {
      gl_Position = vec4(position, 0.0, 1.0 );
    }
  `;
  const {
    vertexPath,
    fragmentPath,
    vertexSrc: vertexSrcIn,
    fragmentSrc: fragmentSrcIn,
    speed = 1,
  } = params;

  let fragmentSrc = fragmentSrcIn;
  let vertexSrc = vertexSrcIn;

  if (fragmentPath) fragmentSrc = (await readFile(fragmentPath)).toString();
  if (vertexPath) vertexSrc = (await readFile(vertexPath)).toString();

  if (!vertexSrc) vertexSrc = defaultVertexSrc;

  const shader = createShader(gl, vertexSrc, fragmentSrc ?? "");
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  // https://blog.mayflower.de/4584-Playing-around-with-pixel-shaders-in-WebGL.html

  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);

  async function readNextFrame(progress: number) {
    shader.bind();

    shader.attributes.position.pointer();

    shader.uniforms.resolution = [width, height];
    shader.uniforms.time = progress * speed;

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    const upsideDownArray = Buffer.allocUnsafe(width * height * channels);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, upsideDownArray);
    const outArray = Buffer.allocUnsafe(width * height * channels);

    // Comes out upside down, flip it
    for (let i = 0; i < outArray.length; i += 4) {
      outArray[i + 0] = upsideDownArray[outArray.length - i + 0];
      outArray[i + 1] = upsideDownArray[outArray.length - i + 1];
      outArray[i + 2] = upsideDownArray[outArray.length - i + 2];
      outArray[i + 3] = upsideDownArray[outArray.length - i + 3];
    }
    return outArray;
  }

  return {
    readNextFrame,
  };
});
