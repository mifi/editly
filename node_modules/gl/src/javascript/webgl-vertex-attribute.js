const { gl } = require('./native-gl')
const { WebGLBuffer } = require('./webgl-buffer')

class WebGLVertexArrayObjectAttribute {
  constructor (ctx, idx) {
    this._ctx = ctx
    this._idx = idx
    this._clear()
  }

  _clear () {
    this._isPointer = false
    this._pointerBuffer = null
    this._pointerOffset = 0
    this._pointerSize = 0
    this._pointerStride = 0
    this._pointerType = gl.FLOAT
    this._pointerNormal = false
    this._divisor = 0
    this._inputSize = 4
    this._inputStride = 0
  }
}

class WebGLVertexArrayGlobalAttribute {
  constructor (idx) {
    this._idx = idx
    this._data = new Float32Array([0, 0, 0, 1])
  }
}

class WebGLVertexArrayObjectState {
  constructor (ctx) {
    const numAttribs = ctx.getParameter(ctx.MAX_VERTEX_ATTRIBS)
    this._attribs = new Array(numAttribs)
    for (let i = 0; i < numAttribs; ++i) {
      this._attribs[i] = new WebGLVertexArrayObjectAttribute(ctx, i)
    }
    this._elementArrayBufferBinding = null
  }

  setElementArrayBuffer (buffer) {
    if (buffer !== null && !(buffer instanceof WebGLBuffer)) {
      throw new TypeError('setElementArrayBuffer(WebGLBuffer?)')
    }
    const current = this._elementArrayBufferBinding
    if (current !== buffer) {
      if (current) {
        current._refCount -= 1
        current._checkDelete()
      }
      if (buffer) {
        buffer._refCount += 1
      }
      this._elementArrayBufferBinding = buffer
    }
  }

  cleanUp () {
    const elementArrayBuffer = this._elementArrayBufferBinding
    if (elementArrayBuffer) {
      elementArrayBuffer._refCount -= 1
      elementArrayBuffer._checkDelete()
      this._elementArrayBufferBinding = null
    }

    for (let i = 0; i < this._attribs.length; ++i) {
      const attrib = this._attribs[i]
      if (attrib._pointerBuffer) {
        attrib._pointerBuffer._refCount -= 1
        attrib._pointerBuffer._checkDelete()
      }
      attrib._clear()
    }
  }

  releaseArrayBuffer (buffer) {
    if (!buffer) {
      return
    }
    for (let i = 0; i < this._attribs.length; ++i) {
      const attrib = this._attribs[i]
      if (attrib._pointerBuffer === buffer) {
        attrib._pointerBuffer._refCount -= 1
        attrib._pointerBuffer._checkDelete()
        attrib._clear()
      }
    }
  }

  setVertexAttribPointer (
    buffer,
    index,
    pointerSize,
    pointerOffset,
    pointerStride,
    pointerType,
    pointerNormal,
    inputStride,
    inputSize) {
    const attrib = this._attribs[index]
    if (buffer !== attrib._pointerBuffer) {
      if (attrib._pointerBuffer) {
        attrib._pointerBuffer._refCount -= 1
        attrib._pointerBuffer._checkDelete()
      }
      if (buffer) {
        buffer._refCount += 1
      }
      attrib._pointerBuffer = buffer
    }
    attrib._pointerSize = pointerSize
    attrib._pointerOffset = pointerOffset
    attrib._pointerStride = pointerStride
    attrib._pointerType = pointerType
    attrib._pointerNormal = pointerNormal
    attrib._inputStride = inputStride
    attrib._inputSize = inputSize
  }
}

class WebGLVertexArrayGlobalState {
  constructor (ctx) {
    const numAttribs = ctx.getParameter(ctx.MAX_VERTEX_ATTRIBS)
    this._attribs = new Array(numAttribs)
    for (let i = 0; i < numAttribs; ++i) {
      this._attribs[i] = new WebGLVertexArrayGlobalAttribute(i)
    }
    this._arrayBufferBinding = null
  }

  setArrayBuffer (buffer) {
    if (buffer !== null && !(buffer instanceof WebGLBuffer)) {
      throw new TypeError('setArrayBuffer(WebGLBuffer?)')
    }
    const current = this._arrayBufferBinding
    if (current !== buffer) {
      if (current) {
        current._refCount -= 1
        current._checkDelete()
      }
      if (buffer) {
        buffer._refCount += 1
      }
      this._arrayBufferBinding = buffer
    }
  }
}

module.exports = {
  WebGLVertexArrayObjectAttribute,
  WebGLVertexArrayGlobalAttribute,
  WebGLVertexArrayObjectState,
  WebGLVertexArrayGlobalState
}
