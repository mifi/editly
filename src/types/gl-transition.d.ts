declare module 'gl-transition' {
  import type GL from 'gl';
  declare function createTransition(gl: GL, transitionSource: any, { resizeMode: string }): any;

  export = { default: createTransition };
}
