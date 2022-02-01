const { Linkable } = require('../linkable')
const { gl } = require('../native-gl')
const { checkObject } = require('../utils')
const { WebGLVertexArrayObjectState } = require('../webgl-vertex-attribute')

class WebGLVertexArrayObjectOES extends Linkable {
  constructor (_, ctx, ext) {
    super(_)
    this._ctx = ctx
    this._ext = ext
    this._vertexState = new WebGLVertexArrayObjectState(ctx)
  }

  _performDelete () {
    // Clean up the vertex state to release references to buffers.
    this._vertexState.cleanUp()

    delete this._vertexState
    delete this._ext._vaos[this._]
    gl.deleteVertexArrayOES.call(this._ctx, this._ | 0)
  }
}

class OESVertexArrayObject {
  constructor (ctx) {
    this.VERTEX_ARRAY_BINDING_OES = 0x85B5

    this._ctx = ctx
    this._vaos = {}
    this._activeVertexArrayObject = null
  }

  createVertexArrayOES () {
    const { _ctx: ctx } = this
    const arrayId = gl.createVertexArrayOES.call(ctx)
    if (arrayId <= 0) return null
    const array = new WebGLVertexArrayObjectOES(arrayId, ctx, this)
    this._vaos[arrayId] = array
    return array
  }

  deleteVertexArrayOES (array) {
    const { _ctx: ctx } = this
    if (!checkObject(array)) {
      throw new TypeError('deleteVertexArrayOES(WebGLVertexArrayObjectOES)')
    }

    if (!(array instanceof WebGLVertexArrayObjectOES &&
      ctx._checkOwns(array))) {
      ctx.setError(gl.INVALID_OPERATION)
      return
    }

    if (array._pendingDelete) {
      return
    }

    if (this._activeVertexArrayObject === array) {
      this.bindVertexArrayOES(null)
    }

    array._pendingDelete = true
    array._checkDelete()
  }

  bindVertexArrayOES (array) {
    const { _ctx: ctx, _activeVertexArrayObject: activeVertexArrayObject } = this
    if (!checkObject(array)) {
      throw new TypeError('bindVertexArrayOES(WebGLVertexArrayObjectOES)')
    }

    if (!array) {
      array = null
      gl.bindVertexArrayOES.call(ctx, null)
    } else if (array instanceof WebGLVertexArrayObjectOES &&
      array._pendingDelete) {
      ctx.setError(gl.INVALID_OPERATION)
      return
    } else if (ctx._checkWrapper(array, WebGLVertexArrayObjectOES)) {
      gl.bindVertexArrayOES.call(ctx, array._)
    } else {
      return
    }

    if (activeVertexArrayObject !== array) {
      if (activeVertexArrayObject) {
        activeVertexArrayObject._refCount -= 1
        activeVertexArrayObject._checkDelete()
      }
      if (array) {
        array._refCount += 1
      }
    }

    if (array === null) {
      ctx._vertexObjectState = ctx._defaultVertexObjectState
    } else {
      ctx._vertexObjectState = array._vertexState
    }

    // Update the active vertex array object.
    this._activeVertexArrayObject = array
  }

  isVertexArrayOES (object) {
    const { _ctx: ctx } = this
    if (!ctx._isObject(object, 'isVertexArrayOES', WebGLVertexArrayObjectOES)) return false
    return gl.isVertexArrayOES.call(ctx, object._ | 0)
  }
}

function getOESVertexArrayObject (ctx) {
  const exts = ctx.getSupportedExtensions()

  if (exts && exts.indexOf('OES_vertex_array_object') >= 0) {
    return new OESVertexArrayObject(ctx)
  } else {
    return null
  }
}

module.exports = {
  WebGLVertexArrayObjectOES,
  OESVertexArrayObject,
  getOESVertexArrayObject
}
