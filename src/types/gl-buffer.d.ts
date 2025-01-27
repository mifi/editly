declare module "gl-buffer" {
  export default function createBuffer(
    gl: WebGLRenderingContext,
    data: number[],
    target: number,
    usage: number,
  ): WebGLBuffer;
}
