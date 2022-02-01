class WebGLTextureUnit {
  constructor (ctx, idx) {
    this._ctx = ctx
    this._idx = idx
    this._mode = 0
    this._bind2D = null
    this._bindCube = null
  }
}

module.exports = { WebGLTextureUnit }
