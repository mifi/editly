class STACKGLDestroyContext {
  constructor (ctx) {
    this.destroy = ctx.destroy.bind(ctx)
  }
}

function getSTACKGLDestroyContext (ctx) {
  return new STACKGLDestroyContext(ctx)
}

module.exports = { getSTACKGLDestroyContext, STACKGLDestroyContext }
