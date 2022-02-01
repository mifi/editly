const { Linkable } = require('./linkable')
const { gl } = require('./native-gl')

class WebGLFramebuffer extends Linkable {
  constructor (_, ctx) {
    super(_)
    this._ctx = ctx
    this._binding = 0

    this._width = 0
    this._height = 0
    this._status = null

    this._attachments = {}
    this._attachments[gl.COLOR_ATTACHMENT0] = null
    this._attachments[gl.DEPTH_ATTACHMENT] = null
    this._attachments[gl.STENCIL_ATTACHMENT] = null
    this._attachments[gl.DEPTH_STENCIL_ATTACHMENT] = null

    this._attachmentLevel = {}
    this._attachmentLevel[gl.COLOR_ATTACHMENT0] = 0
    this._attachmentLevel[gl.DEPTH_ATTACHMENT] = 0
    this._attachmentLevel[gl.STENCIL_ATTACHMENT] = 0
    this._attachmentLevel[gl.DEPTH_STENCIL_ATTACHMENT] = 0

    this._attachmentFace = {}
    this._attachmentFace[gl.COLOR_ATTACHMENT0] = 0
    this._attachmentFace[gl.DEPTH_ATTACHMENT] = 0
    this._attachmentFace[gl.STENCIL_ATTACHMENT] = 0
    this._attachmentFace[gl.DEPTH_STENCIL_ATTACHMENT] = 0

    if (ctx._extensions.webgl_draw_buffers) {
      const { webgl_draw_buffers } = ctx._extensions // eslint-disable-line
      this._attachments[webgl_draw_buffers.COLOR_ATTACHMENT1_WEBGL] = null
      this._attachments[webgl_draw_buffers.COLOR_ATTACHMENT2_WEBGL] = null
      this._attachments[webgl_draw_buffers.COLOR_ATTACHMENT3_WEBGL] = null
      this._attachments[webgl_draw_buffers.COLOR_ATTACHMENT4_WEBGL] = null
      this._attachments[webgl_draw_buffers.COLOR_ATTACHMENT5_WEBGL] = null
      this._attachments[webgl_draw_buffers.COLOR_ATTACHMENT6_WEBGL] = null
      this._attachments[webgl_draw_buffers.COLOR_ATTACHMENT7_WEBGL] = null
      this._attachments[webgl_draw_buffers.COLOR_ATTACHMENT8_WEBGL] = null
      this._attachments[webgl_draw_buffers.COLOR_ATTACHMENT9_WEBGL] = null
      this._attachments[webgl_draw_buffers.COLOR_ATTACHMENT10_WEBGL] = null
      this._attachments[webgl_draw_buffers.COLOR_ATTACHMENT11_WEBGL] = null
      this._attachments[webgl_draw_buffers.COLOR_ATTACHMENT12_WEBGL] = null
      this._attachments[webgl_draw_buffers.COLOR_ATTACHMENT13_WEBGL] = null
      this._attachments[webgl_draw_buffers.COLOR_ATTACHMENT14_WEBGL] = null
      this._attachments[webgl_draw_buffers.COLOR_ATTACHMENT15_WEBGL] = null
      this._attachments[gl.NONE] = null
      this._attachments[gl.BACK] = null

      this._attachmentLevel[webgl_draw_buffers.COLOR_ATTACHMENT1_WEBGL] = 0
      this._attachmentLevel[webgl_draw_buffers.COLOR_ATTACHMENT2_WEBGL] = 0
      this._attachmentLevel[webgl_draw_buffers.COLOR_ATTACHMENT3_WEBGL] = 0
      this._attachmentLevel[webgl_draw_buffers.COLOR_ATTACHMENT4_WEBGL] = 0
      this._attachmentLevel[webgl_draw_buffers.COLOR_ATTACHMENT5_WEBGL] = 0
      this._attachmentLevel[webgl_draw_buffers.COLOR_ATTACHMENT6_WEBGL] = 0
      this._attachmentLevel[webgl_draw_buffers.COLOR_ATTACHMENT7_WEBGL] = 0
      this._attachmentLevel[webgl_draw_buffers.COLOR_ATTACHMENT8_WEBGL] = 0
      this._attachmentLevel[webgl_draw_buffers.COLOR_ATTACHMENT9_WEBGL] = 0
      this._attachmentLevel[webgl_draw_buffers.COLOR_ATTACHMENT10_WEBGL] = 0
      this._attachmentLevel[webgl_draw_buffers.COLOR_ATTACHMENT11_WEBGL] = 0
      this._attachmentLevel[webgl_draw_buffers.COLOR_ATTACHMENT12_WEBGL] = 0
      this._attachmentLevel[webgl_draw_buffers.COLOR_ATTACHMENT13_WEBGL] = 0
      this._attachmentLevel[webgl_draw_buffers.COLOR_ATTACHMENT14_WEBGL] = 0
      this._attachmentLevel[webgl_draw_buffers.COLOR_ATTACHMENT15_WEBGL] = 0
      this._attachmentLevel[gl.NONE] = null
      this._attachmentLevel[gl.BACK] = null

      this._attachmentFace[webgl_draw_buffers.COLOR_ATTACHMENT1_WEBGL] = 0
      this._attachmentFace[webgl_draw_buffers.COLOR_ATTACHMENT2_WEBGL] = 0
      this._attachmentFace[webgl_draw_buffers.COLOR_ATTACHMENT3_WEBGL] = 0
      this._attachmentFace[webgl_draw_buffers.COLOR_ATTACHMENT4_WEBGL] = 0
      this._attachmentFace[webgl_draw_buffers.COLOR_ATTACHMENT5_WEBGL] = 0
      this._attachmentFace[webgl_draw_buffers.COLOR_ATTACHMENT6_WEBGL] = 0
      this._attachmentFace[webgl_draw_buffers.COLOR_ATTACHMENT7_WEBGL] = 0
      this._attachmentFace[webgl_draw_buffers.COLOR_ATTACHMENT8_WEBGL] = 0
      this._attachmentFace[webgl_draw_buffers.COLOR_ATTACHMENT9_WEBGL] = 0
      this._attachmentFace[webgl_draw_buffers.COLOR_ATTACHMENT10_WEBGL] = 0
      this._attachmentFace[webgl_draw_buffers.COLOR_ATTACHMENT11_WEBGL] = 0
      this._attachmentFace[webgl_draw_buffers.COLOR_ATTACHMENT12_WEBGL] = 0
      this._attachmentFace[webgl_draw_buffers.COLOR_ATTACHMENT13_WEBGL] = 0
      this._attachmentFace[webgl_draw_buffers.COLOR_ATTACHMENT14_WEBGL] = 0
      this._attachmentFace[webgl_draw_buffers.COLOR_ATTACHMENT15_WEBGL] = 0
      this._attachmentFace[gl.NONE] = null
      this._attachmentFace[gl.BACK] = null
    }
  }

  _clearAttachment (attachment) {
    const object = this._attachments[attachment]
    if (!object) {
      return
    }
    this._attachments[attachment] = null
    this._unlink(object)
  }

  _setAttachment (object, attachment) {
    const prevObject = this._attachments[attachment]
    if (prevObject === object) {
      return
    }

    this._clearAttachment(attachment)
    if (!object) {
      return
    }

    this._attachments[attachment] = object

    this._link(object)
  }

  _performDelete () {
    const ctx = this._ctx
    delete ctx._framebuffers[this._ | 0]
    gl.deleteFramebuffer.call(ctx, this._ | 0)
  }
}

module.exports = { WebGLFramebuffer }
