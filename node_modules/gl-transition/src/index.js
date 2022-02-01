//@flow
import createShader from "gl-shader";

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

const VERT = `attribute vec2 _p;
varying vec2 _uv;
void main() {
gl_Position = vec4(_p,0.0,1.0);
_uv = vec2(0.5, 0.5) * (_p+vec2(1.0, 1.0));
}`;

// these functions make a GLSL code that map the texture2D uv to preserve ratio for a given ${r} image ratio.
// there are different modes:
const resizeModes: { [_: string]: * } = {
  cover: (r: string) =>
    `.5+(uv-.5)*vec2(min(ratio/${r},1.),min(${r}/ratio,1.))`,
  contain: (r: string) =>
    `.5+(uv-.5)*vec2(max(ratio/${r},1.),max(${r}/ratio,1.))`,
  stretch: () => "uv",
};

const makeFrag = (transitionGlsl: string, resizeMode: string): string => {
  const r = resizeModes[resizeMode];
  if (!r) throw new Error("invalid resizeMode=" + resizeMode);
  return `\
precision highp float;varying vec2 _uv;uniform sampler2D from, to;uniform float progress, ratio, _fromR, _toR;vec4 getFromColor(vec2 uv){return texture2D(from,${r("_fromR")});}vec4 getToColor(vec2 uv){return texture2D(to,${r("_toR")});}
${transitionGlsl}
void main(){gl_FragColor=transition(_uv);}`;
};

export default (
  gl: WebGLRenderingContext,
  transition: TransitionObjectLike,
  options: Options = {}
) => {
  const { resizeMode } = { resizeMode: "cover", ...options };
  const shader = createShader(gl, VERT, makeFrag(transition.glsl, resizeMode));
  shader.bind();
  shader.attributes._p.pointer();

  return {
    draw(
      progress: number,
      from: GLTextureLike,
      to: GLTextureLike,
      width: number = gl.drawingBufferWidth,
      height: number = gl.drawingBufferHeight,
      params: { [key: string]: mixed } = {}
    ) {
      shader.bind();
      shader.uniforms.ratio = width / height;
      shader.uniforms.progress = progress;
      shader.uniforms.from = from.bind(0);
      shader.uniforms.to = to.bind(1);
      shader.uniforms._fromR = from.shape[0] / from.shape[1];
      shader.uniforms._toR = to.shape[0] / to.shape[1];
      let unit = 2;
      for (let key in transition.paramsTypes) {
        const value = key in params
          ? params[key]
          : transition.defaultParams[key];
        if (transition.paramsTypes[key] === "sampler2D") {
          if (!value) {
            console.warn(
              "uniform[" +
                key +
                "]: A texture MUST be defined for uniform sampler2D of a texture"
            );
          } else if (typeof value.bind !== "function") {
            throw new Error(
              "uniform[" +
                key +
                "]: A gl-texture2d API-like object was expected"
            );
          } else {
            shader.uniforms[key] = value.bind(unit++);
          }
        } else {
          shader.uniforms[key] = value;
        }
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      shader.dispose();
    },
  };
};
