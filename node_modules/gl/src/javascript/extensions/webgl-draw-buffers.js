const { gl } = require('../native-gl')

class WebGLDrawBuffers {
  constructor (ctx) {
    this.ctx = ctx
    const exts = ctx.getSupportedExtensions()

    if (exts && exts.indexOf('WEBGL_draw_buffers') >= 0) {
      Object.assign(this, ctx.extWEBGL_draw_buffers())
      this._buffersState = [ctx.BACK]
      this._maxDrawBuffers = ctx._getParameterDirect(this.MAX_DRAW_BUFFERS_WEBGL)
      this._ALL_ATTACHMENTS = []
      this._ALL_COLOR_ATTACHMENTS = []
      const allColorAttachments = [
        this.COLOR_ATTACHMENT0_WEBGL,
        this.COLOR_ATTACHMENT1_WEBGL,
        this.COLOR_ATTACHMENT2_WEBGL,
        this.COLOR_ATTACHMENT3_WEBGL,
        this.COLOR_ATTACHMENT4_WEBGL,
        this.COLOR_ATTACHMENT5_WEBGL,
        this.COLOR_ATTACHMENT6_WEBGL,
        this.COLOR_ATTACHMENT7_WEBGL,
        this.COLOR_ATTACHMENT8_WEBGL,
        this.COLOR_ATTACHMENT9_WEBGL,
        this.COLOR_ATTACHMENT10_WEBGL,
        this.COLOR_ATTACHMENT11_WEBGL,
        this.COLOR_ATTACHMENT12_WEBGL,
        this.COLOR_ATTACHMENT13_WEBGL,
        this.COLOR_ATTACHMENT14_WEBGL,
        this.COLOR_ATTACHMENT15_WEBGL
      ]
      while (this._ALL_ATTACHMENTS.length < this._maxDrawBuffers) {
        const colorAttachment = allColorAttachments.shift()
        this._ALL_ATTACHMENTS.push(colorAttachment)
        this._ALL_COLOR_ATTACHMENTS.push(colorAttachment)
      }
      this._ALL_ATTACHMENTS.push(
        gl.DEPTH_ATTACHMENT,
        gl.STENCIL_ATTACHMENT,
        gl.DEPTH_STENCIL_ATTACHMENT
      )
    }
  }

  drawBuffersWEBGL (buffers) {
    const { ctx } = this
    if (buffers.length < 1) {
      ctx.setError(gl.INVALID_OPERATION)
      return
    }
    if (buffers.length === 1 && buffers[0] === gl.BACK) {
      this._buffersState = buffers
      ctx.drawBuffersWEBGL([this.COLOR_ATTACHMENT0_WEBGL])
      return
    } else if (!ctx._activeFramebuffer) {
      if (buffers.length > 1) {
        ctx.setError(gl.INVALID_OPERATION)
        return
      }
      for (let i = 0; i < buffers.length; i++) {
        if (buffers[i] > gl.NONE) {
          ctx.setError(gl.INVALID_OPERATION)
          return
        }
      }
    }
    this._buffersState = buffers
    ctx.drawBuffersWEBGL(buffers)
  }
}

function getWebGLDrawBuffers (ctx) {
  const exts = ctx.getSupportedExtensions()

  if (exts && exts.indexOf('WEBGL_draw_buffers') >= 0) {
    return new WebGLDrawBuffers(ctx)
  } else {
    return null
  }
}

module.exports = {
  getWebGLDrawBuffers,
  WebGLDrawBuffers
}
