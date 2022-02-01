const { Linkable } = require('./linkable')
const { gl } = require('./native-gl')

class WebGLTexture extends Linkable {
  constructor (_, ctx) {
    super(_)
    this._ctx = ctx
    this._binding = 0
    this._levelWidth = new Int32Array(32)
    this._levelHeight = new Int32Array(32)
    this._format = 0
    this._type = 0
    this._complete = true
  }

  _performDelete () {
    const ctx = this._ctx
    delete ctx._textures[this._ | 0]
    gl.deleteTexture.call(ctx, this._ | 0)
  }
}

module.exports = { WebGLTexture }
