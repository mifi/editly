# gl-transition

a light function to render a [GL Transition](https://gl-transitions.com) frame with a `WebGLRenderingContext`.
The library adopts [stack.gl](http://stack.gl) style.
The only dependency is [gl-shader](https://www.npmjs.com/package/gl-shader).

The only assumption is that you have used `bindBuffer` with "a-big-triangle" buffer (a triangle that covers the surface) so we internally will do `drawArrays(gl.TRIANGLES, 0, 3)`.

## short example

```js
import createTransition from "gl-transition";
const transition = createTransition(glContext, oneTransitionObjectFromGLTransitionsLib);
transition.draw(0.3, fromTexture, toTexture, 512, 256, { param1: 42.0 });
```

## API

The library exports this `createTransition` function:
```js
(
  gl: WebGLRenderingContext,
  transition: TransitionObjectLike,
  options: Options = {}
) => {
  // renders one frame of the transition (up to you to run the animation loop the way you want)
  draw: (
    progress: number,
    from: GLTextureLike,
    to: GLTextureLike,
    width: number = gl.drawingBufferWidth,
    height: number = gl.drawingBufferHeight,
    params: { [key: string]: number | boolean | GLTextureLike } = {}
  ) => void,
  // dispose and destroy all objects created by the function call.
  dispose: () => void,
}
```

where types are:

```js
type TransitionObjectLike = {
  glsl: string,
  defaultParams: { [key: string]: mixed },
  paramsTypes: { [key: string]: string },
};

type GLTextureLike = {
  bind: (unit: number) => number,
  shape: [number, number],
};

type Options = {
  resizeMode?: "cover" | "contain" | "stretch",
};
```

### full example

```js
import transitions from "gl-transitions";
import createTransition from "gl-transition";
import createTexture from "gl-texture2d";

const imageFrom = await loadImage("url1");
const imageTo = await loadImage("url2");
// ^ NB: we just assumed you have these 2 imageFrom and imageTo Image objects that have the image loaded and ready

const canvas = document.createElement("canvas");
document.body.appendChild(canvas);
canvas.width = 500;
canvas.height = 400;

const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(
  gl.ARRAY_BUFFER,
  new Float32Array([-1, -1, -1, 4, 4, -1]), // see a-big-triangle
  gl.STATIC_DRAW
);
gl.viewport(0, 0, width, height);

const from = createTexture(gl, imageFrom);
from.minFilter = gl.LINEAR;
from.magFilter = gl.LINEAR;

const to = createTexture(gl, imageTo);
to.minFilter = gl.LINEAR;
to.magFilter = gl.LINEAR;

const transition = createTransition(gl, transitions.find(t => t.name === "cube")); // https://github.com/gl-transitions/gl-transitions/blob/master/transitions/cube.glsl

// animates forever!
const loop = (t) => {
  requestAnimationFrame(loop);
  transition.draw((t/1000)%1, from, to, canvas.width, canvas.height, { persp: 1.5, unzoom: 0.6 });
}
requestAnimationFrame(loop);
```
