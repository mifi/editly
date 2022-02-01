const { Linkable } = require('./linkable')
const { gl } = require('./native-gl')

class WebGLBuffer extends Linkable {
  constructor (_, ctx) {
    super(_)
    this._ctx = ctx
    this._size = 0
    this._elements = new Uint8Array(0)
  }

  _performDelete () {
    const ctx = this._ctx
    delete ctx._buffers[this._ | 0]
    gl.deleteBuffer.call(ctx, this._ | 0)
  }
}

module.exports = { WebGLBuffer }
