declare module "gl-texture2d" {
  import ndarray from "ndarray";

  // There are other overloads for this function, but we only care about this one.
  declare function createTexture(gl: WebGLRenderingContext, data: ndarray): WebGLTexture;

  export default createTexture;
}
