const { Linkable } = require('./linkable')
const { gl } = require('./native-gl')

class WebGLRenderbuffer extends Linkable {
  constructor (_, ctx) {
    super(_)
    this._ctx = ctx
    this._binding = 0
    this._width = 0
    this._height = 0
    this._format = 0
  }

  _performDelete () {
    const ctx = this._ctx
    delete ctx._renderbuffers[this._ | 0]
    gl.deleteRenderbuffer.call(ctx, this._ | 0)
  }
}

module.exports = { WebGLRenderbuffer }
