const { Linkable } = require('./linkable')
const { gl } = require('./native-gl')

class WebGLProgram extends Linkable {
  constructor (_, ctx) {
    super(_)
    this._ctx = ctx
    this._linkCount = 0
    this._linkStatus = false
    this._linkInfoLog = 'not linked'
    this._attributes = []
    this._uniforms = []
  }

  _performDelete () {
    const ctx = this._ctx
    delete ctx._programs[this._ | 0]
    gl.deleteProgram.call(ctx, this._ | 0)
  }
}

module.exports = { WebGLProgram }
