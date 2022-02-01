class WebGLUniformLocation {
  constructor (_, program, info) {
    this._ = _
    this._program = program
    this._linkCount = program._linkCount
    this._activeInfo = info
    this._array = null
  }
}

module.exports = { WebGLUniformLocation }
