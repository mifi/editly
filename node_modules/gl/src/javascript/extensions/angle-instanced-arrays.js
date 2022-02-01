const { gl } = require('../native-gl')
const { vertexCount } = require('../utils')

class ANGLEInstancedArrays {
  constructor (ctx) {
    this.VERTEX_ATTRIB_ARRAY_DIVISOR_ANGLE = 0x88fe
    this.ctx = ctx

    this._drawArraysInstanced = gl._drawArraysInstanced.bind(ctx)
    this._drawElementsInstanced = gl._drawElementsInstanced.bind(ctx)
    this._vertexAttribDivisor = gl._vertexAttribDivisor.bind(ctx)
  }

  drawArraysInstancedANGLE (mode, first, count, primCount) {
    const { ctx } = this
    mode |= 0
    first |= 0
    count |= 0
    primCount |= 0
    if (first < 0 || count < 0 || primCount < 0) {
      ctx.setError(gl.INVALID_VALUE)
      return
    }
    if (!ctx._checkStencilState()) {
      return
    }
    const reducedCount = vertexCount(mode, count)
    if (reducedCount < 0) {
      ctx.setError(gl.INVALID_ENUM)
      return
    }
    if (!ctx._framebufferOk()) {
      return
    }
    if (count === 0 || primCount === 0) {
      return
    }
    let maxIndex = first
    if (count > 0) {
      maxIndex = (count + first - 1) >>> 0
    }
    if (this.checkInstancedVertexAttribState(maxIndex, primCount)) {
      return this._drawArraysInstanced(mode, first, reducedCount, primCount)
    }
  }

  drawElementsInstancedANGLE (mode, count, type, ioffset, primCount) {
    const { ctx } = this
    mode |= 0
    count |= 0
    type |= 0
    ioffset |= 0
    primCount |= 0

    if (count < 0 || ioffset < 0 || primCount < 0) {
      ctx.setError(gl.INVALID_VALUE)
      return
    }

    if (!ctx._checkStencilState()) {
      return
    }

    const elementBuffer = ctx._vertexObjectState._elementArrayBufferBinding
    if (!elementBuffer) {
      ctx.setError(gl.INVALID_OPERATION)
      return
    }

    // Unpack element data
    let elementData = null
    let offset = ioffset
    if (type === gl.UNSIGNED_SHORT) {
      if (offset % 2) {
        ctx.setError(gl.INVALID_OPERATION)
        return
      }
      offset >>= 1
      elementData = new Uint16Array(elementBuffer._elements.buffer)
    } else if (ctx._extensions.oes_element_index_uint && type === gl.UNSIGNED_INT) {
      if (offset % 4) {
        ctx.setError(gl.INVALID_OPERATION)
        return
      }
      offset >>= 2
      elementData = new Uint32Array(elementBuffer._elements.buffer)
    } else if (type === gl.UNSIGNED_BYTE) {
      elementData = elementBuffer._elements
    } else {
      ctx.setError(gl.INVALID_ENUM)
      return
    }

    let reducedCount = count
    switch (mode) {
      case gl.TRIANGLES:
        if (count % 3) {
          reducedCount -= (count % 3)
        }
        break
      case gl.LINES:
        if (count % 2) {
          reducedCount -= (count % 2)
        }
        break
      case gl.POINTS:
        break
      case gl.LINE_LOOP:
      case gl.LINE_STRIP:
        if (count < 2) {
          ctx.setError(gl.INVALID_OPERATION)
          return
        }
        break
      case gl.TRIANGLE_FAN:
      case gl.TRIANGLE_STRIP:
        if (count < 3) {
          ctx.setError(gl.INVALID_OPERATION)
          return
        }
        break
      default:
        ctx.setError(gl.INVALID_ENUM)
        return
    }

    if (!ctx._framebufferOk()) {
      return
    }

    if (count === 0 || primCount === 0) {
      this.checkInstancedVertexAttribState(0, 0)
      return
    }

    if ((count + offset) >>> 0 > elementData.length) {
      ctx.setError(gl.INVALID_OPERATION)
      return
    }

    // Compute max index
    let maxIndex = -1
    for (let i = offset; i < offset + count; ++i) {
      maxIndex = Math.max(maxIndex, elementData[i])
    }

    if (maxIndex < 0) {
      this.checkInstancedVertexAttribState(0, 0)
      return
    }

    if (this.checkInstancedVertexAttribState(maxIndex, primCount)) {
      if (reducedCount > 0) {
        this._drawElementsInstanced(mode, reducedCount, type, ioffset, primCount)
      }
    }
  }

  vertexAttribDivisorANGLE (index, divisor) {
    const { ctx } = this
    index |= 0
    divisor |= 0
    if (divisor < 0 ||
      index < 0 || index >= ctx._vertexObjectState._attribs.length) {
      ctx.setError(gl.INVALID_VALUE)
      return
    }
    const attrib = ctx._vertexObjectState._attribs[index]
    attrib._divisor = divisor
    this._vertexAttribDivisor(index, divisor)
  }

  checkInstancedVertexAttribState (maxIndex, primCount) {
    const { ctx } = this
    const program = ctx._activeProgram
    if (!program) {
      ctx.setError(gl.INVALID_OPERATION)
      return false
    }

    const attribs = ctx._vertexObjectState._attribs
    let hasZero = false
    for (let i = 0; i < attribs.length; ++i) {
      const attrib = attribs[i]
      if (attrib._isPointer) {
        const buffer = attrib._pointerBuffer
        if (program._attributes.indexOf(i) >= 0) {
          if (!buffer) {
            ctx.setError(gl.INVALID_OPERATION)
            return false
          }
          let maxByte = 0
          if (attrib._divisor === 0) {
            hasZero = true
            maxByte = attrib._pointerStride * maxIndex +
              attrib._pointerSize +
              attrib._pointerOffset
          } else {
            maxByte = attrib._pointerStride * (Math.ceil(primCount / attrib._divisor) - 1) +
              attrib._pointerSize +
              attrib._pointerOffset
          }
          if (maxByte > buffer._size) {
            ctx.setError(gl.INVALID_OPERATION)
            return false
          }
        }
      }
    }

    if (!hasZero) {
      ctx.setError(gl.INVALID_OPERATION)
      return false
    }

    return true
  }
}

function getANGLEInstancedArrays (ctx) {
  return new ANGLEInstancedArrays(ctx)
}

module.exports = { ANGLEInstancedArrays, getANGLEInstancedArrays }
