declare module "gl-transitions" {
  export type GlTransition = {
    name: string;
    author: string;
    license: string;
    glsl: string;
    defaultParams: { [key: string]: mixed };
    paramsTypes: { [key: string]: string };
    createdAt: string;
    updatedAt: string;
  };

  declare const _default: GlTransition[];
  export default _default;
}
