declare module 'gl-texture2d' {
  declare function createTexture(gl: WebGLRenderingContext, data: any): WebGLTexture;

  export default createTexture;
}
