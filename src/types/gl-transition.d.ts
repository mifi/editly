declare module "gl-transition" {
  type TransitionObjectLike = {
    glsl: string;
    defaultParams: { [key: string]: mixed };
    paramsTypes: { [key: string]: string };
  };

  type GLTextureLike = {
    bind: (unit: number) => number;
    shape: [number, number];
  };

  type Options = {
    resizeMode?: "cover" | "contain" | "stretch";
  };

  declare function createTransition(
    gl: WebGLRenderingContext,
    transition: TransitionObjectLike,
    options: Options = {},
  ): {
    // renders one frame of the transition (up to you to run the animation loop the way you want)
    draw: (
      progress: number,
      from: GLTextureLike,
      to: GLTextureLike,
      width: number = gl.drawingBufferWidth,
      height: number = gl.drawingBufferHeight,
      params: { [key: string]: number | number[] | boolean | GLTextureLike } = {},
    ) => void;
    // dispose and destroy all objects created by the function call.
    dispose: () => void;
  };

  export = { default: createTransition };
}

/*

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
*/
