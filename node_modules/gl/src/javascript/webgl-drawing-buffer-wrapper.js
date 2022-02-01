class WebGLDrawingBufferWrapper {
  constructor (framebuffer, color, depthStencil) {
    this._framebuffer = framebuffer
    this._color = color
    this._depthStencil = depthStencil
  }
}

module.exports = { WebGLDrawingBufferWrapper }
