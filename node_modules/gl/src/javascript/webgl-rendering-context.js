const bits = require('bit-twiddle')
const tokenize = require('glsl-tokenizer/string')
const HEADLESS_VERSION = require('../../package.json').version
const { gl, NativeWebGLRenderingContext, NativeWebGL } = require('./native-gl')
const { getANGLEInstancedArrays } = require('./extensions/angle-instanced-arrays')
const { getOESElementIndexUint } = require('./extensions/oes-element-index-unit')
const { getOESStandardDerivatives } = require('./extensions/oes-standard-derivatives')
const { getOESTextureFloat } = require('./extensions/oes-texture-float')
const { getOESTextureFloatLinear } = require('./extensions/oes-texture-float-linear')
const { getSTACKGLDestroyContext } = require('./extensions/stackgl-destroy-context')
const { getSTACKGLResizeDrawingBuffer } = require('./extensions/stackgl-resize-drawing-buffer')
const { getWebGLDrawBuffers } = require('./extensions/webgl-draw-buffers')
const { getEXTBlendMinMax } = require('./extensions/ext-blend-minmax')
const { getEXTTextureFilterAnisotropic } = require('./extensions/ext-texture-filter-anisotropic')
const { getOESVertexArrayObject } = require('./extensions/oes-vertex-array-object')
const {
  bindPublics,
  checkObject,
  checkUniform,
  formatSize,
  isValidString,
  typeSize,
  uniformTypeSize,
  extractImageData,
  vertexCount,
  isTypedArray,
  unpackTypedArray,
  convertPixels,
  checkFormat,
  validCubeTarget
} = require('./utils')

const { WebGLActiveInfo } = require('./webgl-active-info')
const { WebGLFramebuffer } = require('./webgl-framebuffer')
const { WebGLBuffer } = require('./webgl-buffer')
const { WebGLDrawingBufferWrapper } = require('./webgl-drawing-buffer-wrapper')
const { WebGLProgram } = require('./webgl-program')
const { WebGLRenderbuffer } = require('./webgl-renderbuffer')
const { WebGLShader } = require('./webgl-shader')
const { WebGLShaderPrecisionFormat } = require('./webgl-shader-precision-format')
const { WebGLTexture } = require('./webgl-texture')
const { WebGLUniformLocation } = require('./webgl-uniform-location')

// These are defined by the WebGL spec
const MAX_UNIFORM_LENGTH = 256
const MAX_ATTRIBUTE_LENGTH = 256

const DEFAULT_ATTACHMENTS = [
  gl.COLOR_ATTACHMENT0,
  gl.DEPTH_ATTACHMENT,
  gl.STENCIL_ATTACHMENT,
  gl.DEPTH_STENCIL_ATTACHMENT
]

const DEFAULT_COLOR_ATTACHMENTS = [gl.COLOR_ATTACHMENT0]

const availableExtensions = {
  angle_instanced_arrays: getANGLEInstancedArrays,
  oes_element_index_uint: getOESElementIndexUint,
  oes_texture_float: getOESTextureFloat,
  oes_texture_float_linear: getOESTextureFloatLinear,
  oes_standard_derivatives: getOESStandardDerivatives,
  oes_vertex_array_object: getOESVertexArrayObject,
  stackgl_destroy_context: getSTACKGLDestroyContext,
  stackgl_resize_drawingbuffer: getSTACKGLResizeDrawingBuffer,
  webgl_draw_buffers: getWebGLDrawBuffers,
  ext_blend_minmax: getEXTBlendMinMax,
  ext_texture_filter_anisotropic: getEXTTextureFilterAnisotropic
}

const privateMethods = [
  'resize',
  'destroy'
]

function wrapContext (ctx) {
  const wrapper = new WebGLRenderingContext()
  bindPublics(Object.keys(ctx), wrapper, ctx, privateMethods)
  bindPublics(Object.keys(ctx.constructor.prototype), wrapper, ctx, privateMethods)
  bindPublics(Object.getOwnPropertyNames(ctx), wrapper, ctx, privateMethods)
  bindPublics(Object.getOwnPropertyNames(ctx.constructor.prototype), wrapper, ctx, privateMethods)

  Object.defineProperties(wrapper, {
    drawingBufferWidth: {
      get () { return ctx.drawingBufferWidth },
      set (value) { ctx.drawingBufferWidth = value }
    },
    drawingBufferHeight: {
      get () { return ctx.drawingBufferHeight },
      set (value) { ctx.drawingBufferHeight = value }
    }
  })

  return wrapper
}

// We need to wrap some of the native WebGL functions to handle certain error codes and check input values
class WebGLRenderingContext extends NativeWebGLRenderingContext {
  _checkDimensions (
    target,
    width,
    height,
    level) {
    if (level < 0 ||
      width < 0 ||
      height < 0) {
      this.setError(gl.INVALID_VALUE)
      return false
    }
    if (target === gl.TEXTURE_2D) {
      if (width > this._maxTextureSize ||
        height > this._maxTextureSize ||
        level > this._maxTextureLevel) {
        this.setError(gl.INVALID_VALUE)
        return false
      }
    } else if (this._validCubeTarget(target)) {
      if (width > this._maxCubeMapSize ||
        height > this._maxCubeMapSize ||
        level > this._maxCubeMapLevel) {
        this.setError(gl.INVALID_VALUE)
        return false
      }
    } else {
      this.setError(gl.INVALID_ENUM)
      return false
    }
    return true
  }

  _checkLocation (location) {
    if (!(location instanceof WebGLUniformLocation)) {
      this.setError(gl.INVALID_VALUE)
      return false
    } else if (location._program._ctx !== this ||
      location._linkCount !== location._program._linkCount) {
      this.setError(gl.INVALID_OPERATION)
      return false
    }
    return true
  }

  _checkLocationActive (location) {
    if (!location) {
      return false
    } else if (!this._checkLocation(location)) {
      return false
    } else if (location._program !== this._activeProgram) {
      this.setError(gl.INVALID_OPERATION)
      return false
    }
    return true
  }

  _checkOwns (object) {
    return typeof object === 'object' &&
      object._ctx === this
  }

  _checkShaderSource (shader) {
    const source = shader._source
    const tokens = tokenize(source)

    let errorStatus = false
    const errorLog = []

    for (let i = 0; i < tokens.length; ++i) {
      const tok = tokens[i]
      switch (tok.type) {
        case 'ident':
          if (!this._validGLSLIdentifier(tok.data)) {
            errorStatus = true
            errorLog.push(tok.line + ':' + tok.column +
              ' invalid identifier - ' + tok.data)
          }
          break
        case 'preprocessor': {
          const bodyToks = tokenize(tok.data.match(/^\s*#\s*(.*)$/)[1])
          for (let j = 0; j < bodyToks.length; ++j) {
            const btok = bodyToks[j]
            if (btok.type === 'ident' || btok.type === undefined) {
              if (!this._validGLSLIdentifier(btok.data)) {
                errorStatus = true
                errorLog.push(tok.line + ':' + btok.column +
                  ' invalid identifier - ' + btok.data)
              }
            }
          }
          break
        }
        case 'keyword':
          switch (tok.data) {
            case 'do':
              errorStatus = true
              errorLog.push(tok.line + ':' + tok.column + ' do not supported')
              break
          }
          break
        case 'builtin':
          switch (tok.data) {
            case 'dFdx':
            case 'dFdy':
            case 'fwidth':
              if (!this._extensions.oes_standard_derivatives) {
                errorStatus = true
                errorLog.push(tok.line + ':' + tok.column + ' ' + tok.data + ' not supported')
              }
              break
          }
      }
    }

    if (errorStatus) {
      shader._compileInfo = errorLog.join('\n')
    }
    return !errorStatus
  }

  _checkStencilState () {
    if (!this._checkStencil) {
      return this._stencilState
    }
    this._checkStencil = false
    this._stencilState = true
    if (this.getParameter(gl.STENCIL_WRITEMASK) !==
      this.getParameter(gl.STENCIL_BACK_WRITEMASK) ||
      this.getParameter(gl.STENCIL_VALUE_MASK) !==
      this.getParameter(gl.STENCIL_BACK_VALUE_MASK) ||
      this.getParameter(gl.STENCIL_REF) !==
      this.getParameter(gl.STENCIL_BACK_REF)) {
      this.setError(gl.INVALID_OPERATION)
      this._stencilState = false
    }
    return this._stencilState
  }

  _checkTextureTarget (target) {
    const unit = this._getActiveTextureUnit()
    let tex = null
    if (target === gl.TEXTURE_2D) {
      tex = unit._bind2D
    } else if (target === gl.TEXTURE_CUBE_MAP) {
      tex = unit._bindCube
    } else {
      this.setError(gl.INVALID_ENUM)
      return false
    }
    if (!tex) {
      this.setError(gl.INVALID_OPERATION)
      return false
    }
    return true
  }

  _checkWrapper (object, Wrapper) {
    if (!this._checkValid(object, Wrapper)) {
      this.setError(gl.INVALID_VALUE)
      return false
    } else if (!this._checkOwns(object)) {
      this.setError(gl.INVALID_OPERATION)
      return false
    }
    return true
  }

  _checkValid (object, Type) {
    return object instanceof Type && object._ !== 0
  }

  _checkVertexAttribState (maxIndex) {
    const program = this._activeProgram
    if (!program) {
      this.setError(gl.INVALID_OPERATION)
      return false
    }
    const attribs = this._vertexObjectState._attribs
    for (let i = 0; i < attribs.length; ++i) {
      const attrib = attribs[i]
      if (attrib._isPointer) {
        const buffer = attrib._pointerBuffer
        if (!buffer) {
          this.setError(gl.INVALID_OPERATION)
          return false
        }
        if (program._attributes.indexOf(i) >= 0) {
          let maxByte = 0
          if (attrib._divisor) {
            maxByte = attrib._pointerSize +
              attrib._pointerOffset
          } else {
            maxByte = attrib._pointerStride * maxIndex +
              attrib._pointerSize +
              attrib._pointerOffset
          }
          if (maxByte > buffer._size) {
            this.setError(gl.INVALID_OPERATION)
            return false
          }
        }
      }
    }
    return true
  }

  _checkVertexIndex (index) {
    if (index < 0 || index >= this._vertexObjectState._attribs.length) {
      this.setError(gl.INVALID_VALUE)
      return false
    }
    return true
  }

  _computePixelSize (type, internalFormat) {
    const pixelSize = formatSize(internalFormat)
    if (pixelSize === 0) {
      this.setError(gl.INVALID_ENUM)
      return 0
    }
    switch (type) {
      case gl.UNSIGNED_BYTE:
        return pixelSize
      case gl.UNSIGNED_SHORT_5_6_5:
        if (internalFormat !== gl.RGB) {
          this.setError(gl.INVALID_OPERATION)
          break
        }
        return 2
      case gl.UNSIGNED_SHORT_4_4_4_4:
      case gl.UNSIGNED_SHORT_5_5_5_1:
        if (internalFormat !== gl.RGBA) {
          this.setError(gl.INVALID_OPERATION)
          break
        }
        return 2
      case gl.FLOAT:
        return 1
    }
    this.setError(gl.INVALID_ENUM)
    return 0
  }

  _computeRowStride (width, pixelSize) {
    let rowStride = width * pixelSize
    if (rowStride % this._unpackAlignment) {
      rowStride += this._unpackAlignment - (rowStride % this._unpackAlignment)
    }
    return rowStride
  }

  _fixupLink (program) {
    if (!super.getProgramParameter(program._, gl.LINK_STATUS)) {
      program._linkInfoLog = super.getProgramInfoLog(program)
      return false
    }

    // Record attribute attributeLocations
    const numAttribs = this.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES)
    const names = new Array(numAttribs)
    program._attributes.length = numAttribs
    for (let i = 0; i < numAttribs; ++i) {
      names[i] = this.getActiveAttrib(program, i).name
      program._attributes[i] = this.getAttribLocation(program, names[i]) | 0
    }

    // Check attribute names
    for (let i = 0; i < names.length; ++i) {
      if (names[i].length > MAX_ATTRIBUTE_LENGTH) {
        program._linkInfoLog = 'attribute ' + names[i] + ' is too long'
        return false
      }
    }

    for (let i = 0; i < numAttribs; ++i) {
      super.bindAttribLocation(
        program._ | 0,
        program._attributes[i],
        names[i])
    }

    super.linkProgram(program._ | 0)

    const numUniforms = this.getProgramParameter(program, gl.ACTIVE_UNIFORMS)
    program._uniforms.length = numUniforms
    for (let i = 0; i < numUniforms; ++i) {
      program._uniforms[i] = this.getActiveUniform(program, i)
    }

    // Check attribute and uniform name lengths
    for (let i = 0; i < program._uniforms.length; ++i) {
      if (program._uniforms[i].name.length > MAX_UNIFORM_LENGTH) {
        program._linkInfoLog = 'uniform ' + program._uniforms[i].name + ' is too long'
        return false
      }
    }

    program._linkInfoLog = ''
    return true
  }

  _framebufferOk () {
    const framebuffer = this._activeFramebuffer
    if (framebuffer &&
      this._preCheckFramebufferStatus(framebuffer) !== gl.FRAMEBUFFER_COMPLETE) {
      this.setError(gl.INVALID_FRAMEBUFFER_OPERATION)
      return false
    }
    return true
  }

  _getActiveBuffer (target) {
    if (target === gl.ARRAY_BUFFER) {
      return this._vertexGlobalState._arrayBufferBinding
    } else if (target === gl.ELEMENT_ARRAY_BUFFER) {
      return this._vertexObjectState._elementArrayBufferBinding
    }
    return null
  }

  _getActiveTextureUnit () {
    return this._textureUnits[this._activeTextureUnit]
  }

  _getActiveTexture (target) {
    const activeUnit = this._getActiveTextureUnit()
    if (target === gl.TEXTURE_2D) {
      return activeUnit._bind2D
    } else if (target === gl.TEXTURE_CUBE_MAP) {
      return activeUnit._bindCube
    }
    return null
  }

  _getAttachments () {
    return this._extensions.webgl_draw_buffers ? this._extensions.webgl_draw_buffers._ALL_ATTACHMENTS : DEFAULT_ATTACHMENTS
  }

  _getColorAttachments () {
    return this._extensions.webgl_draw_buffers ? this._extensions.webgl_draw_buffers._ALL_COLOR_ATTACHMENTS : DEFAULT_COLOR_ATTACHMENTS
  }

  _getParameterDirect (pname) {
    return super.getParameter(pname)
  }

  _getTexImage (target) {
    const unit = this._getActiveTextureUnit()
    if (target === gl.TEXTURE_2D) {
      return unit._bind2D
    } else if (validCubeTarget(target)) {
      return unit._bindCube
    }
    this.setError(gl.INVALID_ENUM)
    return null
  }

  _preCheckFramebufferStatus (framebuffer) {
    const attachments = framebuffer._attachments
    const width = []
    const height = []
    const depthAttachment = attachments[gl.DEPTH_ATTACHMENT]
    const depthStencilAttachment = attachments[gl.DEPTH_STENCIL_ATTACHMENT]
    const stencilAttachment = attachments[gl.STENCIL_ATTACHMENT]

    if ((depthStencilAttachment && (stencilAttachment || depthAttachment)) ||
      (stencilAttachment && depthAttachment)) {
      return gl.FRAMEBUFFER_UNSUPPORTED
    }

    const colorAttachments = this._getColorAttachments()
    let colorAttachmentCount = 0
    for (const attachmentEnum in attachments) {
      if (attachments[attachmentEnum] && colorAttachments.indexOf(attachmentEnum * 1) !== -1) {
        colorAttachmentCount++
      }
    }
    if (colorAttachmentCount === 0) {
      return gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT
    }

    if (depthStencilAttachment instanceof WebGLTexture) {
      return gl.FRAMEBUFFER_UNSUPPORTED
    } else if (depthStencilAttachment instanceof WebGLRenderbuffer) {
      if (depthStencilAttachment._format !== gl.DEPTH_STENCIL) {
        return gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT
      }
      width.push(depthStencilAttachment._width)
      height.push(depthStencilAttachment._height)
    }

    if (depthAttachment instanceof WebGLTexture) {
      return gl.FRAMEBUFFER_UNSUPPORTED
    } else if (depthAttachment instanceof WebGLRenderbuffer) {
      if (depthAttachment._format !== gl.DEPTH_COMPONENT16) {
        return gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT
      }
      width.push(depthAttachment._width)
      height.push(depthAttachment._height)
    }

    if (stencilAttachment instanceof WebGLTexture) {
      return gl.FRAMEBUFFER_UNSUPPORTED
    } else if (stencilAttachment instanceof WebGLRenderbuffer) {
      if (stencilAttachment._format !== gl.STENCIL_INDEX8) {
        return gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT
      }
      width.push(stencilAttachment._width)
      height.push(stencilAttachment._height)
    }

    let colorAttached = false
    for (let i = 0; i < colorAttachments.length; ++i) {
      const colorAttachment = attachments[colorAttachments[i]]
      if (colorAttachment instanceof WebGLTexture) {
        if (colorAttachment._format !== gl.RGBA ||
          !(colorAttachment._type === gl.UNSIGNED_BYTE || colorAttachment._type === gl.FLOAT)) {
          return gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT
        }
        colorAttached = true
        const level = framebuffer._attachmentLevel[gl.COLOR_ATTACHMENT0]
        width.push(colorAttachment._levelWidth[level])
        height.push(colorAttachment._levelHeight[level])
      } else if (colorAttachment instanceof WebGLRenderbuffer) {
        const format = colorAttachment._format
        if (format !== gl.RGBA4 &&
          format !== gl.RGB565 &&
          format !== gl.RGB5_A1) {
          return gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT
        }
        colorAttached = true
        width.push(colorAttachment._width)
        height.push(colorAttachment._height)
      }
    }

    if (!colorAttached &&
      !stencilAttachment &&
      !depthAttachment &&
      !depthStencilAttachment) {
      return gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT
    }

    if (width.length <= 0 || height.length <= 0) {
      return gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT
    }

    for (let i = 1; i < width.length; ++i) {
      if (width[i - 1] !== width[i] ||
        height[i - 1] !== height[i]) {
        return gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS
      }
    }

    if (width[0] === 0 || height[0] === 0) {
      return gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT
    }

    framebuffer._width = width[0]
    framebuffer._height = height[0]

    return gl.FRAMEBUFFER_COMPLETE
  }

  _isConstantBlendFunc (factor) {
    return (
      factor === gl.CONSTANT_COLOR ||
      factor === gl.ONE_MINUS_CONSTANT_COLOR ||
      factor === gl.CONSTANT_ALPHA ||
      factor === gl.ONE_MINUS_CONSTANT_ALPHA)
  }

  _isObject (object, method, Wrapper) {
    if (!(object === null || object === undefined) &&
      !(object instanceof Wrapper)) {
      throw new TypeError(method + '(' + Wrapper.name + ')')
    }
    if (this._checkValid(object, Wrapper) && this._checkOwns(object)) {
      return true
    }
    return false
  }

  _resizeDrawingBuffer (width, height) {
    const prevFramebuffer = this._activeFramebuffer
    const prevTexture = this._getActiveTexture(gl.TEXTURE_2D)
    const prevRenderbuffer = this._activeRenderbuffer

    const contextAttributes = this._contextAttributes

    const drawingBuffer = this._drawingBuffer
    super.bindFramebuffer(gl.FRAMEBUFFER, drawingBuffer._framebuffer)
    const attachments = this._getAttachments()
    // Clear all attachments
    for (let i = 0; i < attachments.length; ++i) {
      super.framebufferTexture2D(
        gl.FRAMEBUFFER,
        attachments[i],
        gl.TEXTURE_2D,
        0,
        0)
    }

    // Update color attachment
    super.bindTexture(gl.TEXTURE_2D, drawingBuffer._color)
    const colorFormat = contextAttributes.alpha ? gl.RGBA : gl.RGB
    super.texImage2D(
      gl.TEXTURE_2D,
      0,
      colorFormat,
      width,
      height,
      0,
      colorFormat,
      gl.UNSIGNED_BYTE,
      null)
    super.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    super.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    super.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      drawingBuffer._color,
      0)

    // Update depth-stencil attachments if needed
    let storage = 0
    let attachment = 0
    if (contextAttributes.depth && contextAttributes.stencil) {
      storage = gl.DEPTH_STENCIL
      attachment = gl.DEPTH_STENCIL_ATTACHMENT
    } else if (contextAttributes.depth) {
      storage = 0x81A7
      attachment = gl.DEPTH_ATTACHMENT
    } else if (contextAttributes.stencil) {
      storage = gl.STENCIL_INDEX8
      attachment = gl.STENCIL_ATTACHMENT
    }

    if (storage) {
      super.bindRenderbuffer(
        gl.RENDERBUFFER,
        drawingBuffer._depthStencil)
      super.renderbufferStorage(
        gl.RENDERBUFFER,
        storage,
        width,
        height)
      super.framebufferRenderbuffer(
        gl.FRAMEBUFFER,
        attachment,
        gl.RENDERBUFFER,
        drawingBuffer._depthStencil)
    }

    // Restore previous binding state
    this.bindFramebuffer(gl.FRAMEBUFFER, prevFramebuffer)
    this.bindTexture(gl.TEXTURE_2D, prevTexture)
    this.bindRenderbuffer(gl.RENDERBUFFER, prevRenderbuffer)
  }

  _restoreError (lastError) {
    const topError = this._errorStack.pop()
    if (topError === gl.NO_ERROR) {
      this.setError(lastError)
    } else {
      this.setError(topError)
    }
  }

  _saveError () {
    this._errorStack.push(this.getError())
  }

  _switchActiveProgram (active) {
    if (active) {
      active._refCount -= 1
      active._checkDelete()
    }
  }

  _tryDetachFramebuffer (framebuffer, renderbuffer) {
    // FIXME: Does the texture get unbound from *all* framebuffers, or just the
    // active FBO?
    if (framebuffer && framebuffer._linked(renderbuffer)) {
      const attachments = this._getAttachments()
      const framebufferAttachments = Object.keys(framebuffer._attachments)
      for (let i = 0; i < framebufferAttachments.length; ++i) {
        if (framebuffer._attachments[attachments[i]] === renderbuffer) {
          this.framebufferTexture2D(
            gl.FRAMEBUFFER,
            attachments[i] | 0,
            gl.TEXTURE_2D,
            null)
        }
      }
    }
  }

  _updateFramebufferAttachments (framebuffer) {
    const prevStatus = framebuffer._status
    const attachments = this._getAttachments()
    framebuffer._status = this._preCheckFramebufferStatus(framebuffer)
    if (framebuffer._status !== gl.FRAMEBUFFER_COMPLETE) {
      if (prevStatus === gl.FRAMEBUFFER_COMPLETE) {
        for (let i = 0; i < attachments.length; ++i) {
          const attachmentEnum = attachments[i]
          super.framebufferTexture2D(
            gl.FRAMEBUFFER,
            attachmentEnum,
            framebuffer._attachmentFace[attachmentEnum],
            0,
            framebuffer._attachmentLevel[attachmentEnum])
        }
      }
      return
    }

    for (let i = 0; i < attachments.length; ++i) {
      const attachmentEnum = attachments[i]
      super.framebufferTexture2D(
        gl.FRAMEBUFFER,
        attachmentEnum,
        framebuffer._attachmentFace[attachmentEnum],
        0,
        framebuffer._attachmentLevel[attachmentEnum])
    }

    for (let i = 0; i < attachments.length; ++i) {
      const attachmentEnum = attachments[i]
      const attachment = framebuffer._attachments[attachmentEnum]
      if (attachment instanceof WebGLTexture) {
        super.framebufferTexture2D(
          gl.FRAMEBUFFER,
          attachmentEnum,
          framebuffer._attachmentFace[attachmentEnum],
          attachment._ | 0,
          framebuffer._attachmentLevel[attachmentEnum])
      } else if (attachment instanceof WebGLRenderbuffer) {
        super.framebufferRenderbuffer(
          gl.FRAMEBUFFER,
          attachmentEnum,
          gl.RENDERBUFFER,
          attachment._ | 0)
      }
    }
  }

  _validBlendFunc (factor) {
    return factor === gl.ZERO ||
      factor === gl.ONE ||
      factor === gl.SRC_COLOR ||
      factor === gl.ONE_MINUS_SRC_COLOR ||
      factor === gl.DST_COLOR ||
      factor === gl.ONE_MINUS_DST_COLOR ||
      factor === gl.SRC_ALPHA ||
      factor === gl.ONE_MINUS_SRC_ALPHA ||
      factor === gl.DST_ALPHA ||
      factor === gl.ONE_MINUS_DST_ALPHA ||
      factor === gl.SRC_ALPHA_SATURATE ||
      factor === gl.CONSTANT_COLOR ||
      factor === gl.ONE_MINUS_CONSTANT_COLOR ||
      factor === gl.CONSTANT_ALPHA ||
      factor === gl.ONE_MINUS_CONSTANT_ALPHA
  }

  _validBlendMode (mode) {
    return mode === gl.FUNC_ADD ||
      mode === gl.FUNC_SUBTRACT ||
      mode === gl.FUNC_REVERSE_SUBTRACT ||
      (this._extensions.ext_blend_minmax && (
        mode === this._extensions.ext_blend_minmax.MIN_EXT ||
        mode === this._extensions.ext_blend_minmax.MAX_EXT))
  }

  _validCubeTarget (target) {
    return target === gl.TEXTURE_CUBE_MAP_POSITIVE_X ||
      target === gl.TEXTURE_CUBE_MAP_NEGATIVE_X ||
      target === gl.TEXTURE_CUBE_MAP_POSITIVE_Y ||
      target === gl.TEXTURE_CUBE_MAP_NEGATIVE_Y ||
      target === gl.TEXTURE_CUBE_MAP_POSITIVE_Z ||
      target === gl.TEXTURE_CUBE_MAP_NEGATIVE_Z
  }

  _validFramebufferAttachment (attachment) {
    switch (attachment) {
      case gl.DEPTH_ATTACHMENT:
      case gl.STENCIL_ATTACHMENT:
      case gl.DEPTH_STENCIL_ATTACHMENT:
      case gl.COLOR_ATTACHMENT0:
        return true
    }

    if (this._extensions.webgl_draw_buffers) { // eslint-disable-line
      const { webgl_draw_buffers } = this._extensions; // eslint-disable-line
      return attachment < (webgl_draw_buffers.COLOR_ATTACHMENT0_WEBGL + webgl_draw_buffers._maxDrawBuffers) // eslint-disable-line
    }

    return false
  }

  _validGLSLIdentifier (str) {
    return !(str.indexOf('webgl_') === 0 ||
      str.indexOf('_webgl_') === 0 ||
      str.length > 256)
  }

  _validTextureTarget (target) {
    return target === gl.TEXTURE_2D ||
      target === gl.TEXTURE_CUBE_MAP
  }

  _verifyTextureCompleteness (target, pname, param) {
    const unit = this._getActiveTextureUnit()
    let texture = null
    if (target === gl.TEXTURE_2D) {
      texture = unit._bind2D
    } else if (this._validCubeTarget(target)) {
      texture = unit._bindCube
    }

    // oes_texture_float but not oes_texture_float_linear
    if (this._extensions.oes_texture_float && !this._extensions.oes_texture_float_linear && texture && texture._type === gl.FLOAT && (pname === gl.TEXTURE_MAG_FILTER || pname === gl.TEXTURE_MIN_FILTER) && (param === gl.LINEAR || param === gl.LINEAR_MIPMAP_NEAREST || param === gl.NEAREST_MIPMAP_LINEAR || param === gl.LINEAR_MIPMAP_LINEAR)) {
      texture._complete = false
      this.bindTexture(target, texture)
      return
    }

    if (texture && texture._complete === false) {
      texture._complete = true
      this.bindTexture(target, texture)
    }
  }

  _wrapShader (type, source) { // eslint-disable-line
    // the gl implementation seems to define `GL_OES_standard_derivatives` even when the extension is disabled
    // this behaviour causes one conformance test ('GL_OES_standard_derivatives defined in shaders when extension is disabled') to fail
    // by `undef`ing `GL_OES_standard_derivatives`, this appears to solve the issue
    if (!this._extensions.oes_standard_derivatives && /#ifdef\s+GL_OES_standard_derivatives/.test(source)) {
      source = '#undef GL_OES_standard_derivatives\n' + source
    }

    return this._extensions.webgl_draw_buffers ? source : '#define gl_MaxDrawBuffers 1\n' + source // eslint-disable-line
  }

  _beginAttrib0Hack () {
    super.bindBuffer(gl.ARRAY_BUFFER, this._attrib0Buffer._)
    super.bufferData(
      gl.ARRAY_BUFFER,
      this._vertexGlobalState._attribs[0]._data,
      gl.STREAM_DRAW)
    super.enableVertexAttribArray(0)
    super.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0)
    super._vertexAttribDivisor(0, 1)
  }

  _endAttrib0Hack () {
    const attrib = this._vertexObjectState._attribs[0]
    if (attrib._pointerBuffer) {
      super.bindBuffer(gl.ARRAY_BUFFER, attrib._pointerBuffer._)
    } else {
      super.bindBuffer(gl.ARRAY_BUFFER, 0)
    }
    super.vertexAttribPointer(
      0,
      attrib._inputSize,
      attrib._pointerType,
      attrib._pointerNormal,
      attrib._inputStride,
      attrib._pointerOffset)
    super._vertexAttribDivisor(0, attrib._divisor)
    super.disableVertexAttribArray(0)
    if (this._vertexGlobalState._arrayBufferBinding) {
      super.bindBuffer(gl.ARRAY_BUFFER, this._vertexGlobalState._arrayBufferBinding._)
    } else {
      super.bindBuffer(gl.ARRAY_BUFFER, 0)
    }
  }

  activeTexture (texture) {
    texture |= 0
    const texNum = texture - gl.TEXTURE0
    if (texNum >= 0 && texNum < this._textureUnits.length) {
      this._activeTextureUnit = texNum
      return super.activeTexture(texture)
    }

    this.setError(gl.INVALID_ENUM)
  }

  attachShader (program, shader) {
    if (!checkObject(program) ||
      !checkObject(shader)) {
      throw new TypeError('attachShader(WebGLProgram, WebGLShader)')
    }
    if (!program || !shader) {
      this.setError(gl.INVALID_VALUE)
      return
    } else if (program instanceof WebGLProgram &&
      shader instanceof WebGLShader &&
      this._checkOwns(program) &&
      this._checkOwns(shader)) {
      if (!program._linked(shader)) {
        this._saveError()
        super.attachShader(
          program._ | 0,
          shader._ | 0)
        const error = this.getError()
        this._restoreError(error)
        if (error === gl.NO_ERROR) {
          program._link(shader)
        }
        return
      }
    }
    this.setError(gl.INVALID_OPERATION)
  }

  bindAttribLocation (program, index, name) {
    if (!checkObject(program) ||
      typeof name !== 'string') {
      throw new TypeError('bindAttribLocation(WebGLProgram, GLint, String)')
    }
    name += ''
    if (!isValidString(name) || name.length > MAX_ATTRIBUTE_LENGTH) {
      this.setError(gl.INVALID_VALUE)
    } else if (/^_?webgl_a/.test(name)) {
      this.setError(gl.INVALID_OPERATION)
    } else if (this._checkWrapper(program, WebGLProgram)) {
      return super.bindAttribLocation(
        program._ | 0,
        index | 0,
        name)
    }
  }

  bindFramebuffer (target, framebuffer) {
    if (!checkObject(framebuffer)) {
      throw new TypeError('bindFramebuffer(GLenum, WebGLFramebuffer)')
    }
    if (target !== gl.FRAMEBUFFER) {
      this.setError(gl.INVALID_ENUM)
      return
    }
    if (!framebuffer) {
      super.bindFramebuffer(
        gl.FRAMEBUFFER,
        this._drawingBuffer._framebuffer)
    } else if (framebuffer._pendingDelete) {
      return
    } else if (this._checkWrapper(framebuffer, WebGLFramebuffer)) {
      super.bindFramebuffer(
        gl.FRAMEBUFFER,
        framebuffer._ | 0)
    } else {
      return
    }
    const activeFramebuffer = this._activeFramebuffer
    if (activeFramebuffer !== framebuffer) {
      if (activeFramebuffer) {
        activeFramebuffer._refCount -= 1
        activeFramebuffer._checkDelete()
      }
      if (framebuffer) {
        framebuffer._refCount += 1
      }
    }
    this._activeFramebuffer = framebuffer
    if (framebuffer) {
      this._updateFramebufferAttachments(framebuffer)
    }
  }

  bindBuffer (target, buffer) {
    target |= 0
    if (!checkObject(buffer)) {
      throw new TypeError('bindBuffer(GLenum, WebGLBuffer)')
    }
    if (target !== gl.ARRAY_BUFFER &&
      target !== gl.ELEMENT_ARRAY_BUFFER) {
      this.setError(gl.INVALID_ENUM)
      return
    }

    if (!buffer) {
      buffer = null
      super.bindBuffer(target, 0)
    } else if (buffer._pendingDelete) {
      return
    } else if (this._checkWrapper(buffer, WebGLBuffer)) {
      if (buffer._binding && buffer._binding !== target) {
        this.setError(gl.INVALID_OPERATION)
        return
      }
      buffer._binding = target | 0

      super.bindBuffer(target, buffer._ | 0)
    } else {
      return
    }

    if (target === gl.ARRAY_BUFFER) {
      // Buffers of type ARRAY_BUFFER are bound to the global vertex state.
      this._vertexGlobalState.setArrayBuffer(buffer)
    } else {
      // Buffers of type ELEMENT_ARRAY_BUFFER are bound to vertex array object state.
      this._vertexObjectState.setElementArrayBuffer(buffer)
    }
  }

  bindRenderbuffer (target, object) {
    if (!checkObject(object)) {
      throw new TypeError('bindRenderbuffer(GLenum, WebGLRenderbuffer)')
    }

    if (target !== gl.RENDERBUFFER) {
      this.setError(gl.INVALID_ENUM)
      return
    }

    if (!object) {
      super.bindRenderbuffer(
        target | 0,
        0)
    } else if (object._pendingDelete) {
      return
    } else if (this._checkWrapper(object, WebGLRenderbuffer)) {
      super.bindRenderbuffer(
        target | 0,
        object._ | 0)
    } else {
      return
    }
    const active = this._activeRenderbuffer
    if (active !== object) {
      if (active) {
        active._refCount -= 1
        active._checkDelete()
      }
      if (object) {
        object._refCount += 1
      }
    }
    this._activeRenderbuffer = object
  }

  bindTexture (target, texture) {
    target |= 0

    if (!checkObject(texture)) {
      throw new TypeError('bindTexture(GLenum, WebGLTexture)')
    }

    if (!this._validTextureTarget(target)) {
      this.setError(gl.INVALID_ENUM)
      return
    }

    // Get texture id
    let textureId = 0
    if (!texture) {
      texture = null
    } else if (texture instanceof WebGLTexture &&
      texture._pendingDelete) {
      // Special case: error codes for deleted textures don't get set for some dumb reason
      return
    } else if (this._checkWrapper(texture, WebGLTexture)) {
      // Check binding mode of texture
      if (texture._binding && texture._binding !== target) {
        this.setError(gl.INVALID_OPERATION)
        return
      }
      texture._binding = target

      if (texture._complete) {
        textureId = texture._ | 0
      }
    } else {
      return
    }

    this._saveError()
    super.bindTexture(
      target,
      textureId)
    const error = this.getError()
    this._restoreError(error)

    if (error !== gl.NO_ERROR) {
      return
    }

    const activeUnit = this._getActiveTextureUnit()
    const activeTex = this._getActiveTexture(target)

    // Update references
    if (activeTex !== texture) {
      if (activeTex) {
        activeTex._refCount -= 1
        activeTex._checkDelete()
      }
      if (texture) {
        texture._refCount += 1
      }
    }

    if (target === gl.TEXTURE_2D) {
      activeUnit._bind2D = texture
    } else if (target === gl.TEXTURE_CUBE_MAP) {
      activeUnit._bindCube = texture
    }
  }

  blendColor (red, green, blue, alpha) {
    return super.blendColor(+red, +green, +blue, +alpha)
  }

  blendEquation (mode) {
    mode |= 0
    if (this._validBlendMode(mode)) {
      return super.blendEquation(mode)
    }
    this.setError(gl.INVALID_ENUM)
  }

  blendEquationSeparate (modeRGB, modeAlpha) {
    modeRGB |= 0
    modeAlpha |= 0
    if (this._validBlendMode(modeRGB) && this._validBlendMode(modeAlpha)) {
      return super.blendEquationSeparate(modeRGB, modeAlpha)
    }
    this.setError(gl.INVALID_ENUM)
  }

  createBuffer () {
    const id = super.createBuffer()
    if (id <= 0) return null
    const webGLBuffer = new WebGLBuffer(id, this)
    this._buffers[id] = webGLBuffer
    return webGLBuffer
  }

  createFramebuffer () {
    const id = super.createFramebuffer()
    if (id <= 0) return null
    const webGLFramebuffer = new WebGLFramebuffer(id, this)
    this._framebuffers[id] = webGLFramebuffer
    return webGLFramebuffer
  }

  createProgram () {
    const id = super.createProgram()
    if (id <= 0) return null
    const webGLProgram = new WebGLProgram(id, this)
    this._programs[id] = webGLProgram
    return webGLProgram
  }

  createRenderbuffer () {
    const id = super.createRenderbuffer()
    if (id <= 0) return null
    const webGLRenderbuffer = new WebGLRenderbuffer(id, this)
    this._renderbuffers[id] = webGLRenderbuffer
    return webGLRenderbuffer
  }

  createTexture () {
    const id = super.createTexture()
    if (id <= 0) return null
    const webGlTexture = new WebGLTexture(id, this)
    this._textures[id] = webGlTexture
    return webGlTexture
  }

  getContextAttributes () {
    return this._contextAttributes
  }

  getExtension (name) {
    const str = name.toLowerCase()
    if (str in this._extensions) {
      return this._extensions[str]
    }
    const ext = availableExtensions[str] ? availableExtensions[str](this) : null
    if (ext) {
      this._extensions[str] = ext
    }
    return ext
  }

  getSupportedExtensions () {
    const exts = [
      'ANGLE_instanced_arrays',
      'STACKGL_resize_drawingbuffer',
      'STACKGL_destroy_context'
    ]

    const supportedExts = super.getSupportedExtensions()

    if (supportedExts.indexOf('GL_OES_element_index_uint') >= 0) {
      exts.push('OES_element_index_uint')
    }

    if (supportedExts.indexOf('GL_OES_standard_derivatives') >= 0) {
      exts.push('OES_standard_derivatives')
    }

    if (supportedExts.indexOf('GL_OES_texture_float') >= 0) {
      exts.push('OES_texture_float')
    }

    if (supportedExts.indexOf('GL_OES_texture_float_linear') >= 0) {
      exts.push('OES_texture_float_linear')
    }

    if (supportedExts.indexOf('EXT_draw_buffers') >= 0) {
      exts.push('WEBGL_draw_buffers')
    }

    if (supportedExts.indexOf('EXT_blend_minmax') >= 0) {
      exts.push('EXT_blend_minmax')
    }

    if (supportedExts.indexOf('EXT_texture_filter_anisotropic') >= 0) {
      exts.push('EXT_texture_filter_anisotropic')
    }

    if (supportedExts.indexOf('GL_OES_vertex_array_object') >= 0) {
      exts.push('OES_vertex_array_object')
    }

    return exts
  }

  setError (error) {
    NativeWebGL.setError.call(this, error | 0)
  }

  blendFunc (sfactor, dfactor) {
    sfactor |= 0
    dfactor |= 0
    if (!this._validBlendFunc(sfactor) ||
      !this._validBlendFunc(dfactor)) {
      this.setError(gl.INVALID_ENUM)
      return
    }
    if (this._isConstantBlendFunc(sfactor) && this._isConstantBlendFunc(dfactor)) {
      this.setError(gl.INVALID_OPERATION)
      return
    }
    super.blendFunc(sfactor, dfactor)
  }

  blendFuncSeparate (
    srcRGB,
    dstRGB,
    srcAlpha,
    dstAlpha) {
    srcRGB |= 0
    dstRGB |= 0
    srcAlpha |= 0
    dstAlpha |= 0

    if (!(this._validBlendFunc(srcRGB) &&
      this._validBlendFunc(dstRGB) &&
      this._validBlendFunc(srcAlpha) &&
      this._validBlendFunc(dstAlpha))) {
      this.setError(gl.INVALID_ENUM)
      return
    }

    if ((this._isConstantBlendFunc(srcRGB) && this._isConstantBlendFunc(dstRGB)) ||
      (this._isConstantBlendFunc(srcAlpha) && this._isConstantBlendFunc(dstAlpha))) {
      this.setError(gl.INVALID_OPERATION)
      return
    }

    super.blendFuncSeparate(
      srcRGB,
      dstRGB,
      srcAlpha,
      dstAlpha)
  }

  bufferData (target, data, usage) {
    target |= 0
    usage |= 0
    if (usage !== gl.STREAM_DRAW &&
      usage !== gl.STATIC_DRAW &&
      usage !== gl.DYNAMIC_DRAW) {
      this.setError(gl.INVALID_ENUM)
      return
    }

    if (target !== gl.ARRAY_BUFFER &&
      target !== gl.ELEMENT_ARRAY_BUFFER) {
      this.setError(gl.INVALID_ENUM)
      return
    }

    const active = this._getActiveBuffer(target)
    if (!active) {
      this.setError(gl.INVALID_OPERATION)
      return
    }

    if (typeof data === 'object') {
      let u8Data = null
      if (isTypedArray(data)) {
        u8Data = unpackTypedArray(data)
      } else if (data instanceof ArrayBuffer) {
        u8Data = new Uint8Array(data)
      } else {
        this.setError(gl.INVALID_VALUE)
        return
      }

      this._saveError()
      super.bufferData(
        target,
        u8Data,
        usage)
      const error = this.getError()
      this._restoreError(error)
      if (error !== gl.NO_ERROR) {
        return
      }

      active._size = u8Data.length
      if (target === gl.ELEMENT_ARRAY_BUFFER) {
        active._elements = new Uint8Array(u8Data)
      }
    } else if (typeof data === 'number') {
      const size = data | 0
      if (size < 0) {
        this.setError(gl.INVALID_VALUE)
        return
      }

      this._saveError()
      super.bufferData(
        target,
        size,
        usage)
      const error = this.getError()
      this._restoreError(error)
      if (error !== gl.NO_ERROR) {
        return
      }

      active._size = size
      if (target === gl.ELEMENT_ARRAY_BUFFER) {
        active._elements = new Uint8Array(size)
      }
    } else {
      this.setError(gl.INVALID_VALUE)
    }
  }

  bufferSubData (target, offset, data) {
    target |= 0
    offset |= 0

    if (target !== gl.ARRAY_BUFFER &&
      target !== gl.ELEMENT_ARRAY_BUFFER) {
      this.setError(gl.INVALID_ENUM)
      return
    }

    if (data === null) {
      return
    }

    if (!data || typeof data !== 'object') {
      this.setError(gl.INVALID_VALUE)
      return
    }

    const active = this._getActiveBuffer(target)
    if (!active) {
      this.setError(gl.INVALID_OPERATION)
      return
    }

    if (offset < 0 || offset >= active._size) {
      this.setError(gl.INVALID_VALUE)
      return
    }

    let u8Data = null
    if (isTypedArray(data)) {
      u8Data = unpackTypedArray(data)
    } else if (data instanceof ArrayBuffer) {
      u8Data = new Uint8Array(data)
    } else {
      this.setError(gl.INVALID_VALUE)
      return
    }

    if (offset + u8Data.length > active._size) {
      this.setError(gl.INVALID_VALUE)
      return
    }

    if (target === gl.ELEMENT_ARRAY_BUFFER) {
      active._elements.set(u8Data, offset)
    }

    super.bufferSubData(
      target,
      offset,
      u8Data)
  }

  checkFramebufferStatus (target) {
    if (target !== gl.FRAMEBUFFER) {
      this.setError(gl.INVALID_ENUM)
      return 0
    }

    const framebuffer = this._activeFramebuffer
    if (!framebuffer) {
      return gl.FRAMEBUFFER_COMPLETE
    }

    return this._preCheckFramebufferStatus(framebuffer)
  }

  clear (mask) {
    if (!this._framebufferOk()) {
      return
    }
    return super.clear(mask | 0)
  }

  clearColor (red, green, blue, alpha) {
    return super.clearColor(+red, +green, +blue, +alpha)
  }

  clearDepth (depth) {
    return super.clearDepth(+depth)
  }

  clearStencil (s) {
    this._checkStencil = false
    return super.clearStencil(s | 0)
  }

  colorMask (red, green, blue, alpha) {
    return super.colorMask(!!red, !!green, !!blue, !!alpha)
  }

  compileShader (shader) {
    if (!checkObject(shader)) {
      throw new TypeError('compileShader(WebGLShader)')
    }
    if (this._checkWrapper(shader, WebGLShader) &&
      this._checkShaderSource(shader)) {
      const prevError = this.getError()
      super.compileShader(shader._ | 0)
      const error = this.getError()
      shader._compileStatus = !!super.getShaderParameter(
        shader._ | 0,
        gl.COMPILE_STATUS)
      shader._compileInfo = super.getShaderInfoLog(shader._ | 0)
      this.getError()
      this.setError(prevError || error)
    }
  }

  copyTexImage2D (
    target,
    level,
    internalFormat,
    x, y, width, height,
    border) {
    target |= 0
    level |= 0
    internalFormat |= 0
    x |= 0
    y |= 0
    width |= 0
    height |= 0
    border |= 0

    const texture = this._getTexImage(target)
    if (!texture) {
      this.setError(gl.INVALID_OPERATION)
      return
    }

    if (internalFormat !== gl.RGBA &&
      internalFormat !== gl.RGB &&
      internalFormat !== gl.ALPHA &&
      internalFormat !== gl.LUMINANCE &&
      internalFormat !== gl.LUMINANCE_ALPHA) {
      this.setError(gl.INVALID_ENUM)
      return
    }

    if (level < 0 || width < 0 || height < 0 || border !== 0) {
      this.setError(gl.INVALID_VALUE)
      return
    }

    if (level > 0 && !(bits.isPow2(width) && bits.isPow2(height))) {
      this.setError(gl.INVALID_VALUE)
      return
    }

    this._saveError()
    super.copyTexImage2D(
      target,
      level,
      internalFormat,
      x,
      y,
      width,
      height,
      border)
    const error = this.getError()
    this._restoreError(error)

    if (error === gl.NO_ERROR) {
      texture._levelWidth[level] = width
      texture._levelHeight[level] = height
      texture._format = gl.RGBA
      texture._type = gl.UNSIGNED_BYTE
    }
  }

  copyTexSubImage2D (
    target,
    level,
    xoffset, yoffset,
    x, y, width, height) {
    target |= 0
    level |= 0
    xoffset |= 0
    yoffset |= 0
    x |= 0
    y |= 0
    width |= 0
    height |= 0

    const texture = this._getTexImage(target)
    if (!texture) {
      this.setError(gl.INVALID_OPERATION)
      return
    }

    if (width < 0 || height < 0 || xoffset < 0 || yoffset < 0 || level < 0) {
      this.setError(gl.INVALID_VALUE)
      return
    }

    super.copyTexSubImage2D(
      target,
      level,
      xoffset,
      yoffset,
      x,
      y,
      width,
      height)
  }

  cullFace (mode) {
    return super.cullFace(mode | 0)
  }

  createShader (type) {
    type |= 0
    if (type !== gl.FRAGMENT_SHADER &&
      type !== gl.VERTEX_SHADER) {
      this.setError(gl.INVALID_ENUM)
      return null
    }
    const id = super.createShader(type)
    if (id < 0) {
      return null
    }
    const result = new WebGLShader(id, this, type)
    this._shaders[id] = result
    return result
  }

  deleteProgram (object) {
    return this._deleteLinkable('deleteProgram', object, WebGLProgram)
  }

  deleteShader (object) {
    return this._deleteLinkable('deleteShader', object, WebGLShader)
  }

  _deleteLinkable (name, object, Type) {
    if (!checkObject(object)) {
      throw new TypeError(name + '(' + Type.name + ')')
    }
    if (object instanceof Type &&
      this._checkOwns(object)) {
      object._pendingDelete = true
      object._checkDelete()
      return
    }
    this.setError(gl.INVALID_OPERATION)
  }

  deleteBuffer (buffer) {
    if (!checkObject(buffer) ||
      (buffer !== null && !(buffer instanceof WebGLBuffer))) {
      throw new TypeError('deleteBuffer(WebGLBuffer)')
    }

    if (!(buffer instanceof WebGLBuffer &&
      this._checkOwns(buffer))) {
      this.setError(gl.INVALID_OPERATION)
      return
    }

    if (this._vertexGlobalState._arrayBufferBinding === buffer) {
      this.bindBuffer(gl.ARRAY_BUFFER, null)
    }
    if (this._vertexObjectState._elementArrayBufferBinding === buffer) {
      this.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)
    }

    if (this._vertexObjectState === this._defaultVertexObjectState) {
      // If no vertex array object is bound, release attrib bindings for the
      // array buffer.
      this._vertexObjectState.releaseArrayBuffer(buffer)
    }

    buffer._pendingDelete = true
    buffer._checkDelete()
  }

  deleteFramebuffer (framebuffer) {
    if (!checkObject(framebuffer)) {
      throw new TypeError('deleteFramebuffer(WebGLFramebuffer)')
    }

    if (!(framebuffer instanceof WebGLFramebuffer &&
      this._checkOwns(framebuffer))) {
      this.setError(gl.INVALID_OPERATION)
      return
    }

    if (this._activeFramebuffer === framebuffer) {
      this.bindFramebuffer(gl.FRAMEBUFFER, null)
    }

    framebuffer._pendingDelete = true
    framebuffer._checkDelete()
  }

  // Need to handle textures and render buffers as a special case:
  // When a texture gets deleted, we need to do the following extra steps:
  //  1. Is it bound to the current texture unit?
  //     If so, then unbind it
  //  2. Is it attached to the active fbo?
  //     If so, then detach it
  //
  // For renderbuffers only need to do second step
  //
  // After this, proceed with the usual deletion algorithm
  //
  deleteRenderbuffer (renderbuffer) {
    if (!checkObject(renderbuffer)) {
      throw new TypeError('deleteRenderbuffer(WebGLRenderbuffer)')
    }

    if (!(renderbuffer instanceof WebGLRenderbuffer &&
      this._checkOwns(renderbuffer))) {
      this.setError(gl.INVALID_OPERATION)
      return
    }

    if (this._activeRenderbuffer === renderbuffer) {
      this.bindRenderbuffer(gl.RENDERBUFFER, null)
    }

    const activeFramebuffer = this._activeFramebuffer

    this._tryDetachFramebuffer(activeFramebuffer, renderbuffer)

    renderbuffer._pendingDelete = true
    renderbuffer._checkDelete()
  }

  deleteTexture (texture) {
    if (!checkObject(texture)) {
      throw new TypeError('deleteTexture(WebGLTexture)')
    }

    if (texture instanceof WebGLTexture) {
      if (!this._checkOwns(texture)) {
        this.setError(gl.INVALID_OPERATION)
        return
      }
    } else {
      return
    }

    // Unbind from all texture units
    const curActive = this._activeTextureUnit

    for (let i = 0; i < this._textureUnits.length; ++i) {
      const unit = this._textureUnits[i]
      if (unit._bind2D === texture) {
        this.activeTexture(gl.TEXTURE0 + i)
        this.bindTexture(gl.TEXTURE_2D, null)
      } else if (unit._bindCube === texture) {
        this.activeTexture(gl.TEXTURE0 + i)
        this.bindTexture(gl.TEXTURE_CUBE_MAP, null)
      }
    }
    this.activeTexture(gl.TEXTURE0 + curActive)

    // FIXME: Does the texture get unbound from *all* framebuffers, or just the
    // active FBO?
    const ctx = this
    const activeFramebuffer = this._activeFramebuffer
    function tryDetach (framebuffer) {
      if (framebuffer && framebuffer._linked(texture)) {
        const attachments = ctx._getAttachments()
        for (let i = 0; i < attachments.length; ++i) {
          const attachment = attachments[i]
          if (framebuffer._attachments[attachment] === texture) {
            ctx.framebufferTexture2D(
              gl.FRAMEBUFFER,
              attachment,
              gl.TEXTURE_2D,
              null)
          }
        }
      }
    }

    tryDetach(activeFramebuffer)

    // Mark texture for deletion
    texture._pendingDelete = true
    texture._checkDelete()
  }

  depthFunc (func) {
    func |= 0
    switch (func) {
      case gl.NEVER:
      case gl.LESS:
      case gl.EQUAL:
      case gl.LEQUAL:
      case gl.GREATER:
      case gl.NOTEQUAL:
      case gl.GEQUAL:
      case gl.ALWAYS:
        return super.depthFunc(func)
      default:
        this.setError(gl.INVALID_ENUM)
    }
  }

  depthMask (flag) {
    return super.depthMask(!!flag)
  }

  depthRange (zNear, zFar) {
    zNear = +zNear
    zFar = +zFar
    if (zNear <= zFar) {
      return super.depthRange(zNear, zFar)
    }
    this.setError(gl.INVALID_OPERATION)
  }

  destroy () {
    super.destroy()
  }

  detachShader (program, shader) {
    if (!checkObject(program) ||
      !checkObject(shader)) {
      throw new TypeError('detachShader(WebGLProgram, WebGLShader)')
    }
    if (this._checkWrapper(program, WebGLProgram) &&
      this._checkWrapper(shader, WebGLShader)) {
      if (program._linked(shader)) {
        super.detachShader(program._, shader._)
        program._unlink(shader)
      } else {
        this.setError(gl.INVALID_OPERATION)
      }
    }
  }

  disable (cap) {
    cap |= 0
    super.disable(cap)
    if (cap === gl.TEXTURE_2D ||
      cap === gl.TEXTURE_CUBE_MAP) {
      const active = this._getActiveTextureUnit()
      if (active._mode === cap) {
        active._mode = 0
      }
    }
  }

  disableVertexAttribArray (index) {
    index |= 0
    if (index < 0 || index >= this._vertexObjectState._attribs.length) {
      this.setError(gl.INVALID_VALUE)
      return
    }
    super.disableVertexAttribArray(index)
    this._vertexObjectState._attribs[index]._isPointer = false
  }

  drawArrays (mode, first, count) {
    mode |= 0
    first |= 0
    count |= 0

    if (first < 0 || count < 0) {
      this.setError(gl.INVALID_VALUE)
      return
    }

    if (!this._checkStencilState()) {
      return
    }

    const reducedCount = vertexCount(mode, count)
    if (reducedCount < 0) {
      this.setError(gl.INVALID_ENUM)
      return
    }

    if (!this._framebufferOk()) {
      return
    }

    if (count === 0) {
      return
    }

    let maxIndex = first
    if (count > 0) {
      maxIndex = (count + first - 1) >>> 0
    }
    if (this._checkVertexAttribState(maxIndex)) {
      if (
        this._vertexObjectState._attribs[0]._isPointer || (
          this._extensions.webgl_draw_buffers &&
          this._extensions.webgl_draw_buffers._buffersState &&
          this._extensions.webgl_draw_buffers._buffersState.length > 0
        )
      ) {
        return super.drawArrays(mode, first, reducedCount)
      } else {
        this._beginAttrib0Hack()
        super._drawArraysInstanced(mode, first, reducedCount, 1)
        this._endAttrib0Hack()
      }
    }
  }

  drawElements (mode, count, type, ioffset) {
    mode |= 0
    count |= 0
    type |= 0
    ioffset |= 0

    if (count < 0 || ioffset < 0) {
      this.setError(gl.INVALID_VALUE)
      return
    }

    if (!this._checkStencilState()) {
      return
    }

    const elementBuffer = this._vertexObjectState._elementArrayBufferBinding
    if (!elementBuffer) {
      this.setError(gl.INVALID_OPERATION)
      return
    }

    // Unpack element data
    let elementData = null
    let offset = ioffset
    if (type === gl.UNSIGNED_SHORT) {
      if (offset % 2) {
        this.setError(gl.INVALID_OPERATION)
        return
      }
      offset >>= 1
      elementData = new Uint16Array(elementBuffer._elements.buffer)
    } else if (this._extensions.oes_element_index_uint && type === gl.UNSIGNED_INT) {
      if (offset % 4) {
        this.setError(gl.INVALID_OPERATION)
        return
      }
      offset >>= 2
      elementData = new Uint32Array(elementBuffer._elements.buffer)
    } else if (type === gl.UNSIGNED_BYTE) {
      elementData = elementBuffer._elements
    } else {
      this.setError(gl.INVALID_ENUM)
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
          this.setError(gl.INVALID_OPERATION)
          return
        }
        break
      case gl.TRIANGLE_FAN:
      case gl.TRIANGLE_STRIP:
        if (count < 3) {
          this.setError(gl.INVALID_OPERATION)
          return
        }
        break
      default:
        this.setError(gl.INVALID_ENUM)
        return
    }

    if (!this._framebufferOk()) {
      return
    }

    if (count === 0) {
      this._checkVertexAttribState(0)
      return
    }

    if ((count + offset) >>> 0 > elementData.length) {
      this.setError(gl.INVALID_OPERATION)
      return
    }

    // Compute max index
    let maxIndex = -1
    for (let i = offset; i < offset + count; ++i) {
      maxIndex = Math.max(maxIndex, elementData[i])
    }

    if (maxIndex < 0) {
      this._checkVertexAttribState(0)
      return
    }

    if (this._checkVertexAttribState(maxIndex)) {
      if (reducedCount > 0) {
        if (this._vertexObjectState._attribs[0]._isPointer) {
          return super.drawElements(mode, reducedCount, type, ioffset)
        } else {
          this._beginAttrib0Hack()
          super._drawElementsInstanced(mode, reducedCount, type, ioffset, 1)
          this._endAttrib0Hack()
        }
      }
    }
  }

  enable (cap) {
    cap |= 0
    super.enable(cap)
  }

  enableVertexAttribArray (index) {
    index |= 0
    if (index < 0 || index >= this._vertexObjectState._attribs.length) {
      this.setError(gl.INVALID_VALUE)
      return
    }

    super.enableVertexAttribArray(index)

    this._vertexObjectState._attribs[index]._isPointer = true
  }

  finish () {
    return super.finish()
  }

  flush () {
    return super.flush()
  }

  framebufferRenderbuffer (
    target,
    attachment,
    renderbufferTarget,
    renderbuffer) {
    target = target | 0
    attachment = attachment | 0
    renderbufferTarget = renderbufferTarget | 0

    if (!checkObject(renderbuffer)) {
      throw new TypeError('framebufferRenderbuffer(GLenum, GLenum, GLenum, WebGLRenderbuffer)')
    }

    if (target !== gl.FRAMEBUFFER ||
      !this._validFramebufferAttachment(attachment) ||
      renderbufferTarget !== gl.RENDERBUFFER) {
      this.setError(gl.INVALID_ENUM)
      return
    }

    const framebuffer = this._activeFramebuffer
    if (!framebuffer) {
      this.setError(gl.INVALID_OPERATION)
      return
    }

    if (renderbuffer && !this._checkWrapper(renderbuffer, WebGLRenderbuffer)) {
      return
    }

    framebuffer._setAttachment(renderbuffer, attachment)
    this._updateFramebufferAttachments(framebuffer)
  }

  framebufferTexture2D (
    target,
    attachment,
    textarget,
    texture,
    level) {
    target |= 0
    attachment |= 0
    textarget |= 0
    level |= 0
    if (!checkObject(texture)) {
      throw new TypeError('framebufferTexture2D(GLenum, GLenum, GLenum, WebGLTexture, GLint)')
    }

    // Check parameters are ok
    if (target !== gl.FRAMEBUFFER ||
      !this._validFramebufferAttachment(attachment)) {
      this.setError(gl.INVALID_ENUM)
      return
    }

    if (level !== 0) {
      this.setError(gl.INVALID_VALUE)
      return
    }

    // Check object ownership
    if (texture && !this._checkWrapper(texture, WebGLTexture)) {
      return
    }

    // Check texture target is ok
    if (textarget === gl.TEXTURE_2D) {
      if (texture && texture._binding !== gl.TEXTURE_2D) {
        this.setError(gl.INVALID_OPERATION)
        return
      }
    } else if (this._validCubeTarget(textarget)) {
      if (texture && texture._binding !== gl.TEXTURE_CUBE_MAP) {
        this.setError(gl.INVALID_OPERATION)
        return
      }
    } else {
      this.setError(gl.INVALID_ENUM)
      return
    }

    // Check a framebuffer is actually bound
    const framebuffer = this._activeFramebuffer
    if (!framebuffer) {
      this.setError(gl.INVALID_OPERATION)
      return
    }

    framebuffer._attachmentLevel[attachment] = level
    framebuffer._attachmentFace[attachment] = textarget
    framebuffer._setAttachment(texture, attachment)
    this._updateFramebufferAttachments(framebuffer)
  }

  frontFace (mode) {
    return super.frontFace(mode | 0)
  }

  generateMipmap (target) {
    return super.generateMipmap(target | 0) | 0
  }

  getActiveAttrib (program, index) {
    if (!checkObject(program)) {
      throw new TypeError('getActiveAttrib(WebGLProgram)')
    } else if (!program) {
      this.setError(gl.INVALID_VALUE)
    } else if (this._checkWrapper(program, WebGLProgram)) {
      const info = super.getActiveAttrib(program._ | 0, index | 0)
      if (info) {
        return new WebGLActiveInfo(info)
      }
    }
    return null
  }

  getActiveUniform (program, index) {
    if (!checkObject(program)) {
      throw new TypeError('getActiveUniform(WebGLProgram, GLint)')
    } else if (!program) {
      this.setError(gl.INVALID_VALUE)
    } else if (this._checkWrapper(program, WebGLProgram)) {
      const info = super.getActiveUniform(program._ | 0, index | 0)
      if (info) {
        return new WebGLActiveInfo(info)
      }
    }
    return null
  }

  getAttachedShaders (program) {
    if (!checkObject(program) ||
      (typeof program === 'object' &&
        program !== null &&
        !(program instanceof WebGLProgram))) {
      throw new TypeError('getAttachedShaders(WebGLProgram)')
    }
    if (!program) {
      this.setError(gl.INVALID_VALUE)
    } else if (this._checkWrapper(program, WebGLProgram)) {
      const shaderArray = super.getAttachedShaders(program._ | 0)
      if (!shaderArray) {
        return null
      }
      const unboxedShaders = new Array(shaderArray.length)
      for (let i = 0; i < shaderArray.length; ++i) {
        unboxedShaders[i] = this._shaders[shaderArray[i]]
      }
      return unboxedShaders
    }
    return null
  }

  getAttribLocation (program, name) {
    if (!checkObject(program)) {
      throw new TypeError('getAttribLocation(WebGLProgram, String)')
    }
    name += ''
    if (!isValidString(name) || name.length > MAX_ATTRIBUTE_LENGTH) {
      this.setError(gl.INVALID_VALUE)
    } else if (this._checkWrapper(program, WebGLProgram)) {
      return super.getAttribLocation(program._ | 0, name + '')
    }
    return -1
  }

  getParameter (pname) {
    pname |= 0
    switch (pname) {
      case gl.ARRAY_BUFFER_BINDING:
        return this._vertexGlobalState._arrayBufferBinding
      case gl.ELEMENT_ARRAY_BUFFER_BINDING:
        return this._vertexObjectState._elementArrayBufferBinding
      case gl.CURRENT_PROGRAM:
        return this._activeProgram
      case gl.FRAMEBUFFER_BINDING:
        return this._activeFramebuffer
      case gl.RENDERBUFFER_BINDING:
        return this._activeRenderbuffer
      case gl.TEXTURE_BINDING_2D:
        return this._getActiveTextureUnit()._bind2D
      case gl.TEXTURE_BINDING_CUBE_MAP:
        return this._getActiveTextureUnit()._bindCube
      case gl.VERSION:
        return 'WebGL 1.0 stack-gl ' + HEADLESS_VERSION
      case gl.VENDOR:
        return 'stack-gl'
      case gl.RENDERER:
        return 'ANGLE'
      case gl.SHADING_LANGUAGE_VERSION:
        return 'WebGL GLSL ES 1.0 stack-gl'

      case gl.COMPRESSED_TEXTURE_FORMATS:
        return new Uint32Array(0)

      // Int arrays
      case gl.MAX_VIEWPORT_DIMS:
      case gl.SCISSOR_BOX:
      case gl.VIEWPORT:
        return new Int32Array(super.getParameter(pname))

      // Float arrays
      case gl.ALIASED_LINE_WIDTH_RANGE:
      case gl.ALIASED_POINT_SIZE_RANGE:
      case gl.DEPTH_RANGE:
      case gl.BLEND_COLOR:
      case gl.COLOR_CLEAR_VALUE:
        return new Float32Array(super.getParameter(pname))

      case gl.COLOR_WRITEMASK:
        return super.getParameter(pname)

      case gl.DEPTH_CLEAR_VALUE:
      case gl.LINE_WIDTH:
      case gl.POLYGON_OFFSET_FACTOR:
      case gl.POLYGON_OFFSET_UNITS:
      case gl.SAMPLE_COVERAGE_VALUE:
        return +super.getParameter(pname)

      case gl.BLEND:
      case gl.CULL_FACE:
      case gl.DEPTH_TEST:
      case gl.DEPTH_WRITEMASK:
      case gl.DITHER:
      case gl.POLYGON_OFFSET_FILL:
      case gl.SAMPLE_COVERAGE_INVERT:
      case gl.SCISSOR_TEST:
      case gl.STENCIL_TEST:
      case gl.UNPACK_FLIP_Y_WEBGL:
      case gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL:
        return !!super.getParameter(pname)

      case gl.ACTIVE_TEXTURE:
      case gl.ALPHA_BITS:
      case gl.BLEND_DST_ALPHA:
      case gl.BLEND_DST_RGB:
      case gl.BLEND_EQUATION_ALPHA:
      case gl.BLEND_EQUATION_RGB:
      case gl.BLEND_SRC_ALPHA:
      case gl.BLEND_SRC_RGB:
      case gl.BLUE_BITS:
      case gl.CULL_FACE_MODE:
      case gl.DEPTH_BITS:
      case gl.DEPTH_FUNC:
      case gl.FRONT_FACE:
      case gl.GENERATE_MIPMAP_HINT:
      case gl.GREEN_BITS:
      case gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS:
      case gl.MAX_CUBE_MAP_TEXTURE_SIZE:
      case gl.MAX_FRAGMENT_UNIFORM_VECTORS:
      case gl.MAX_RENDERBUFFER_SIZE:
      case gl.MAX_TEXTURE_IMAGE_UNITS:
      case gl.MAX_TEXTURE_SIZE:
      case gl.MAX_VARYING_VECTORS:
      case gl.MAX_VERTEX_ATTRIBS:
      case gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS:
      case gl.MAX_VERTEX_UNIFORM_VECTORS:
      case gl.PACK_ALIGNMENT:
      case gl.RED_BITS:
      case gl.SAMPLE_BUFFERS:
      case gl.SAMPLES:
      case gl.STENCIL_BACK_FAIL:
      case gl.STENCIL_BACK_FUNC:
      case gl.STENCIL_BACK_PASS_DEPTH_FAIL:
      case gl.STENCIL_BACK_PASS_DEPTH_PASS:
      case gl.STENCIL_BACK_REF:
      case gl.STENCIL_BACK_VALUE_MASK:
      case gl.STENCIL_BACK_WRITEMASK:
      case gl.STENCIL_BITS:
      case gl.STENCIL_CLEAR_VALUE:
      case gl.STENCIL_FAIL:
      case gl.STENCIL_FUNC:
      case gl.STENCIL_PASS_DEPTH_FAIL:
      case gl.STENCIL_PASS_DEPTH_PASS:
      case gl.STENCIL_REF:
      case gl.STENCIL_VALUE_MASK:
      case gl.STENCIL_WRITEMASK:
      case gl.SUBPIXEL_BITS:
      case gl.UNPACK_ALIGNMENT:
      case gl.UNPACK_COLORSPACE_CONVERSION_WEBGL:
        return super.getParameter(pname) | 0

      case gl.IMPLEMENTATION_COLOR_READ_FORMAT:
      case gl.IMPLEMENTATION_COLOR_READ_TYPE:
        return super.getParameter(pname)

      default:
        if (this._extensions.webgl_draw_buffers) {
          const ext = this._extensions.webgl_draw_buffers
          switch (pname) {
            case ext.DRAW_BUFFER0_WEBGL:
            case ext.DRAW_BUFFER1_WEBGL:
            case ext.DRAW_BUFFER2_WEBGL:
            case ext.DRAW_BUFFER3_WEBGL:
            case ext.DRAW_BUFFER4_WEBGL:
            case ext.DRAW_BUFFER5_WEBGL:
            case ext.DRAW_BUFFER6_WEBGL:
            case ext.DRAW_BUFFER7_WEBGL:
            case ext.DRAW_BUFFER8_WEBGL:
            case ext.DRAW_BUFFER9_WEBGL:
            case ext.DRAW_BUFFER10_WEBGL:
            case ext.DRAW_BUFFER11_WEBGL:
            case ext.DRAW_BUFFER12_WEBGL:
            case ext.DRAW_BUFFER13_WEBGL:
            case ext.DRAW_BUFFER14_WEBGL:
            case ext.DRAW_BUFFER15_WEBGL:
              if (ext._buffersState.length === 1 && ext._buffersState[0] === gl.BACK) {
                return gl.BACK
              }
              return super.getParameter(pname)
            case ext.MAX_DRAW_BUFFERS_WEBGL:
            case ext.MAX_COLOR_ATTACHMENTS_WEBGL:
              return super.getParameter(pname)
          }
        }

        if (this._extensions.oes_standard_derivatives && pname === this._extensions.oes_standard_derivatives.FRAGMENT_SHADER_DERIVATIVE_HINT_OES) {
          return super.getParameter(pname)
        }

        if (this._extensions.ext_texture_filter_anisotropic && pname === this._extensions.ext_texture_filter_anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT) {
          return super.getParameter(pname)
        }

        if (this._extensions.oes_vertex_array_object && pname === this._extensions.oes_vertex_array_object.VERTEX_ARRAY_BINDING_OES) {
          return this._extensions.oes_vertex_array_object._activeVertexArrayObject
        }

        this.setError(gl.INVALID_ENUM)
        return null
    }
  }

  getShaderPrecisionFormat (
    shaderType,
    precisionType) {
    shaderType |= 0
    precisionType |= 0

    if (!(shaderType === gl.FRAGMENT_SHADER ||
      shaderType === gl.VERTEX_SHADER) ||
      !(precisionType === gl.LOW_FLOAT ||
        precisionType === gl.MEDIUM_FLOAT ||
        precisionType === gl.HIGH_FLOAT ||
        precisionType === gl.LOW_INT ||
        precisionType === gl.MEDIUM_INT ||
        precisionType === gl.HIGH_INT)) {
      this.setError(gl.INVALID_ENUM)
      return
    }

    const format = super.getShaderPrecisionFormat(shaderType, precisionType)
    if (!format) {
      return null
    }

    return new WebGLShaderPrecisionFormat(format)
  }

  getBufferParameter (target, pname) {
    target |= 0
    pname |= 0
    if (target !== gl.ARRAY_BUFFER &&
      target !== gl.ELEMENT_ARRAY_BUFFER) {
      this.setError(gl.INVALID_ENUM)
      return null
    }

    switch (pname) {
      case gl.BUFFER_SIZE:
      case gl.BUFFER_USAGE:
        return super.getBufferParameter(target | 0, pname | 0)
      default:
        this.setError(gl.INVALID_ENUM)
        return null
    }
  }

  getError () {
    return super.getError()
  }

  getFramebufferAttachmentParameter (target, attachment, pname) {
    target |= 0
    attachment |= 0
    pname |= 0

    if (target !== gl.FRAMEBUFFER ||
      !this._validFramebufferAttachment(attachment)) {
      this.setError(gl.INVALID_ENUM)
      return null
    }

    const framebuffer = this._activeFramebuffer
    if (!framebuffer) {
      this.setError(gl.INVALID_OPERATION)
      return null
    }

    const object = framebuffer._attachments[attachment]
    if (object === null) {
      if (pname === gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE) {
        return gl.NONE
      }
    } else if (object instanceof WebGLTexture) {
      switch (pname) {
        case gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME:
          return object
        case gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE:
          return gl.TEXTURE
        case gl.FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL:
          return framebuffer._attachmentLevel[attachment]
        case gl.FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE: {
          const face = framebuffer._attachmentFace[attachment]
          if (face === gl.TEXTURE_2D) {
            return 0
          }
          return face
        }
      }
    } else if (object instanceof WebGLRenderbuffer) {
      switch (pname) {
        case gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME:
          return object
        case gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE:
          return gl.RENDERBUFFER
      }
    }

    this.setError(gl.INVALID_ENUM)
    return null
  }

  getProgramParameter (program, pname) {
    pname |= 0
    if (!checkObject(program)) {
      throw new TypeError('getProgramParameter(WebGLProgram, GLenum)')
    } else if (this._checkWrapper(program, WebGLProgram)) {
      switch (pname) {
        case gl.DELETE_STATUS:
          return program._pendingDelete

        case gl.LINK_STATUS:
          return program._linkStatus

        case gl.VALIDATE_STATUS:
          return !!super.getProgramParameter(program._, pname)

        case gl.ATTACHED_SHADERS:
        case gl.ACTIVE_ATTRIBUTES:
        case gl.ACTIVE_UNIFORMS:
          return super.getProgramParameter(program._, pname)
      }
      this.setError(gl.INVALID_ENUM)
    }
    return null
  }

  getProgramInfoLog (program) {
    if (!checkObject(program)) {
      throw new TypeError('getProgramInfoLog(WebGLProgram)')
    } else if (this._checkWrapper(program, WebGLProgram)) {
      return program._linkInfoLog
    }
    return null
  }

  getRenderbufferParameter (target, pname) {
    target |= 0
    pname |= 0
    if (target !== gl.RENDERBUFFER) {
      this.setError(gl.INVALID_ENUM)
      return null
    }
    const renderbuffer = this._activeRenderbuffer
    if (!renderbuffer) {
      this.setError(gl.INVALID_OPERATION)
      return null
    }
    switch (pname) {
      case gl.RENDERBUFFER_INTERNAL_FORMAT:
        return renderbuffer._format
      case gl.RENDERBUFFER_WIDTH:
        return renderbuffer._width
      case gl.RENDERBUFFER_HEIGHT:
        return renderbuffer._height
      case gl.RENDERBUFFER_SIZE:
      case gl.RENDERBUFFER_RED_SIZE:
      case gl.RENDERBUFFER_GREEN_SIZE:
      case gl.RENDERBUFFER_BLUE_SIZE:
      case gl.RENDERBUFFER_ALPHA_SIZE:
      case gl.RENDERBUFFER_DEPTH_SIZE:
      case gl.RENDERBUFFER_STENCIL_SIZE:
        return super.getRenderbufferParameter(target, pname)
    }
    this.setError(gl.INVALID_ENUM)
    return null
  }

  getShaderParameter (shader, pname) {
    pname |= 0
    if (!checkObject(shader)) {
      throw new TypeError('getShaderParameter(WebGLShader, GLenum)')
    } else if (this._checkWrapper(shader, WebGLShader)) {
      switch (pname) {
        case gl.DELETE_STATUS:
          return shader._pendingDelete
        case gl.COMPILE_STATUS:
          return shader._compileStatus
        case gl.SHADER_TYPE:
          return shader._type
      }
      this.setError(gl.INVALID_ENUM)
    }
    return null
  }

  getShaderInfoLog (shader) {
    if (!checkObject(shader)) {
      throw new TypeError('getShaderInfoLog(WebGLShader)')
    } else if (this._checkWrapper(shader, WebGLShader)) {
      return shader._compileInfo
    }
    return null
  }

  getShaderSource (shader) {
    if (!checkObject(shader)) {
      throw new TypeError('Input to getShaderSource must be an object')
    } else if (this._checkWrapper(shader, WebGLShader)) {
      return shader._source
    }
    return null
  }

  getTexParameter (target, pname) {
    target |= 0
    pname |= 0

    if (!this._checkTextureTarget(target)) {
      return null
    }

    const unit = this._getActiveTextureUnit()
    if ((target === gl.TEXTURE_2D && !unit._bind2D) ||
      (target === gl.TEXTURE_CUBE_MAP && !unit._bindCube)) {
      this.setError(gl.INVALID_OPERATION)
      return null
    }

    switch (pname) {
      case gl.TEXTURE_MAG_FILTER:
      case gl.TEXTURE_MIN_FILTER:
      case gl.TEXTURE_WRAP_S:
      case gl.TEXTURE_WRAP_T:
        return super.getTexParameter(target, pname)
    }

    if (this._extensions.ext_texture_filter_anisotropic && pname === this._extensions.ext_texture_filter_anisotropic.TEXTURE_MAX_ANISOTROPY_EXT) {
      return super.getTexParameter(target, pname)
    }

    this.setError(gl.INVALID_ENUM)
    return null
  }

  getUniform (program, location) {
    if (!checkObject(program) ||
      !checkObject(location)) {
      throw new TypeError('getUniform(WebGLProgram, WebGLUniformLocation)')
    } else if (!program) {
      this.setError(gl.INVALID_VALUE)
      return null
    } else if (!location) {
      return null
    } else if (this._checkWrapper(program, WebGLProgram)) {
      if (!checkUniform(program, location)) {
        this.setError(gl.INVALID_OPERATION)
        return null
      }
      const data = super.getUniform(program._ | 0, location._ | 0)
      if (!data) {
        return null
      }
      switch (location._activeInfo.type) {
        case gl.FLOAT:
          return data[0]
        case gl.FLOAT_VEC2:
          return new Float32Array(data.slice(0, 2))
        case gl.FLOAT_VEC3:
          return new Float32Array(data.slice(0, 3))
        case gl.FLOAT_VEC4:
          return new Float32Array(data.slice(0, 4))
        case gl.INT:
          return data[0] | 0
        case gl.INT_VEC2:
          return new Int32Array(data.slice(0, 2))
        case gl.INT_VEC3:
          return new Int32Array(data.slice(0, 3))
        case gl.INT_VEC4:
          return new Int32Array(data.slice(0, 4))
        case gl.BOOL:
          return !!data[0]
        case gl.BOOL_VEC2:
          return [!!data[0], !!data[1]]
        case gl.BOOL_VEC3:
          return [!!data[0], !!data[1], !!data[2]]
        case gl.BOOL_VEC4:
          return [!!data[0], !!data[1], !!data[2], !!data[3]]
        case gl.FLOAT_MAT2:
          return new Float32Array(data.slice(0, 4))
        case gl.FLOAT_MAT3:
          return new Float32Array(data.slice(0, 9))
        case gl.FLOAT_MAT4:
          return new Float32Array(data.slice(0, 16))
        case gl.SAMPLER_2D:
        case gl.SAMPLER_CUBE:
          return data[0] | 0
        default:
          return null
      }
    }
    return null
  }

  getUniformLocation (program, name) {
    if (!checkObject(program)) {
      throw new TypeError('getUniformLocation(WebGLProgram, String)')
    }

    name += ''
    if (!isValidString(name)) {
      this.setError(gl.INVALID_VALUE)
      return
    }

    if (this._checkWrapper(program, WebGLProgram)) {
      const loc = super.getUniformLocation(program._ | 0, name)
      if (loc >= 0) {
        let searchName = name
        if (/\[\d+\]$/.test(name)) {
          searchName = name.replace(/\[\d+\]$/, '[0]')
        }

        let info = null
        for (let i = 0; i < program._uniforms.length; ++i) {
          const infoItem = program._uniforms[i]
          if (infoItem.name === searchName) {
            info = {
              size: infoItem.size,
              type: infoItem.type,
              name: infoItem.name
            }
          }
        }
        if (!info) {
          return null
        }

        const result = new WebGLUniformLocation(
          loc,
          program,
          info)

        // handle array case
        if (/\[0\]$/.test(name)) {
          const baseName = name.replace(/\[0\]$/, '')
          const arrayLocs = []

          // if (offset < 0 || offset >= info.size) {
          //   return null
          // }

          this._saveError()
          for (let i = 0; this.getError() === gl.NO_ERROR; ++i) {
            const xloc = super.getUniformLocation(
              program._ | 0,
              baseName + '[' + i + ']')
            if (this.getError() !== gl.NO_ERROR || xloc < 0) {
              break
            }
            arrayLocs.push(xloc)
          }
          this._restoreError(gl.NO_ERROR)

          result._array = arrayLocs
        } else if (/\[(\d+)\]$/.test(name)) {
          const offset = +(/\[(\d+)\]$/.exec(name))[1]
          if (offset < 0 || offset >= info.size) {
            return null
          }
        }
        return result
      }
    }
    return null
  }

  getVertexAttrib (index, pname) {
    index |= 0
    pname |= 0
    if (index < 0 || index >= this._vertexObjectState._attribs.length) {
      this.setError(gl.INVALID_VALUE)
      return null
    }
    const attrib = this._vertexObjectState._attribs[index]
    const vertexAttribValue = this._vertexGlobalState._attribs[index]._data

    const extInstancing = this._extensions.angle_instanced_arrays
    if (extInstancing) {
      if (pname === extInstancing.VERTEX_ATTRIB_ARRAY_DIVISOR_ANGLE) {
        return attrib._divisor
      }
    }

    switch (pname) {
      case gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING:
        return attrib._pointerBuffer
      case gl.VERTEX_ATTRIB_ARRAY_ENABLED:
        return attrib._isPointer
      case gl.VERTEX_ATTRIB_ARRAY_SIZE:
        return attrib._inputSize
      case gl.VERTEX_ATTRIB_ARRAY_STRIDE:
        return attrib._inputStride
      case gl.VERTEX_ATTRIB_ARRAY_TYPE:
        return attrib._pointerType
      case gl.VERTEX_ATTRIB_ARRAY_NORMALIZED:
        return attrib._pointerNormal
      case gl.CURRENT_VERTEX_ATTRIB:
        return new Float32Array(vertexAttribValue)
      default:
        this.setError(gl.INVALID_ENUM)
        return null
    }
  }

  getVertexAttribOffset (index, pname) {
    index |= 0
    pname |= 0
    if (index < 0 || index >= this._vertexObjectState._attribs.length) {
      this.setError(gl.INVALID_VALUE)
      return null
    }
    if (pname === gl.VERTEX_ATTRIB_ARRAY_POINTER) {
      return this._vertexObjectState._attribs[index]._pointerOffset
    } else {
      this.setError(gl.INVALID_ENUM)
      return null
    }
  }

  hint (target, mode) {
    target |= 0
    mode |= 0

    if (!(
      target === gl.GENERATE_MIPMAP_HINT ||
      (
        this._extensions.oes_standard_derivatives && target === this._extensions.oes_standard_derivatives.FRAGMENT_SHADER_DERIVATIVE_HINT_OES
      )
    )) {
      this.setError(gl.INVALID_ENUM)
      return
    }

    if (mode !== gl.FASTEST &&
      mode !== gl.NICEST &&
      mode !== gl.DONT_CARE) {
      this.setError(gl.INVALID_ENUM)
      return
    }

    return super.hint(target, mode)
  }

  isBuffer (object) {
    if (!this._isObject(object, 'isBuffer', WebGLBuffer)) return false
    return super.isBuffer(object._ | 0)
  }

  isFramebuffer (object) {
    if (!this._isObject(object, 'isFramebuffer', WebGLFramebuffer)) return false
    return super.isFramebuffer(object._ | 0)
  }

  isProgram (object) {
    if (!this._isObject(object, 'isProgram', WebGLProgram)) return false
    return super.isProgram(object._ | 0)
  }

  isRenderbuffer (object) {
    if (!this._isObject(object, 'isRenderbuffer', WebGLRenderbuffer)) return false
    return super.isRenderbuffer(object._ | 0)
  }

  isShader (object) {
    if (!this._isObject(object, 'isShader', WebGLShader)) return false
    return super.isShader(object._ | 0)
  }

  isTexture (object) {
    if (!this._isObject(object, 'isTexture', WebGLTexture)) return false
    return super.isTexture(object._ | 0)
  }

  isEnabled (cap) {
    return super.isEnabled(cap | 0)
  }

  lineWidth (width) {
    if (isNaN(width)) {
      this.setError(gl.INVALID_VALUE)
      return
    }
    return super.lineWidth(+width)
  }

  linkProgram (program) {
    if (!checkObject(program)) {
      throw new TypeError('linkProgram(WebGLProgram)')
    }
    if (this._checkWrapper(program, WebGLProgram)) {
      program._linkCount += 1
      program._attributes = []
      const prevError = this.getError()
      super.linkProgram(program._ | 0)
      const error = this.getError()
      if (error === gl.NO_ERROR) {
        program._linkStatus = this._fixupLink(program)
      }
      this.getError()
      this.setError(prevError || error)
    }
  }

  pixelStorei (pname, param) {
    pname |= 0
    param |= 0
    if (pname === gl.UNPACK_ALIGNMENT) {
      if (param === 1 ||
        param === 2 ||
        param === 4 ||
        param === 8) {
        this._unpackAlignment = param
      } else {
        this.setError(gl.INVALID_VALUE)
        return
      }
    } else if (pname === gl.PACK_ALIGNMENT) {
      if (param === 1 ||
        param === 2 ||
        param === 4 ||
        param === 8) {
        this._packAlignment = param
      } else {
        this.setError(gl.INVALID_VALUE)
        return
      }
    } else if (pname === gl.UNPACK_COLORSPACE_CONVERSION_WEBGL) {
      if (!(param === gl.NONE || param === gl.BROWSER_DEFAULT_WEBGL)) {
        this.setError(gl.INVALID_VALUE)
        return
      }
    }
    return super.pixelStorei(pname, param)
  }

  polygonOffset (factor, units) {
    return super.polygonOffset(+factor, +units)
  }

  readPixels (x, y, width, height, format, type, pixels) {
    x |= 0
    y |= 0
    width |= 0
    height |= 0

    if (this._extensions.oes_texture_float && type === gl.FLOAT && format === gl.RGBA) {
    } else if (format === gl.RGB ||
      format === gl.ALPHA ||
      type !== gl.UNSIGNED_BYTE) {
      this.setError(gl.INVALID_OPERATION)
      return
    } else if (format !== gl.RGBA) {
      this.setError(gl.INVALID_ENUM)
      return
    } else if (
      width < 0 ||
      height < 0 ||
      !(pixels instanceof Uint8Array)) {
      this.setError(gl.INVALID_VALUE)
      return
    }

    if (!this._framebufferOk()) {
      return
    }

    let rowStride = width * 4
    if (rowStride % this._packAlignment !== 0) {
      rowStride += this._packAlignment - (rowStride % this._packAlignment)
    }

    const imageSize = rowStride * (height - 1) + width * 4
    if (imageSize <= 0) {
      return
    }
    if (pixels.length < imageSize) {
      this.setError(gl.INVALID_VALUE)
      return
    }

    // Handle reading outside the window
    let viewWidth = this.drawingBufferWidth
    let viewHeight = this.drawingBufferHeight

    if (this._activeFramebuffer) {
      viewWidth = this._activeFramebuffer._width
      viewHeight = this._activeFramebuffer._height
    }

    const pixelData = unpackTypedArray(pixels)

    if (x >= viewWidth || x + width <= 0 ||
      y >= viewHeight || y + height <= 0) {
      for (let i = 0; i < pixelData.length; ++i) {
        pixelData[i] = 0
      }
    } else if (x < 0 || x + width > viewWidth ||
      y < 0 || y + height > viewHeight) {
      for (let i = 0; i < pixelData.length; ++i) {
        pixelData[i] = 0
      }

      let nx = x
      let nWidth = width
      if (x < 0) {
        nWidth += x
        nx = 0
      }
      if (nx + width > viewWidth) {
        nWidth = viewWidth - nx
      }
      let ny = y
      let nHeight = height
      if (y < 0) {
        nHeight += y
        ny = 0
      }
      if (ny + height > viewHeight) {
        nHeight = viewHeight - ny
      }

      let nRowStride = nWidth * 4
      if (nRowStride % this._packAlignment !== 0) {
        nRowStride += this._packAlignment - (nRowStride % this._packAlignment)
      }

      if (nWidth > 0 && nHeight > 0) {
        const subPixels = new Uint8Array(nRowStride * nHeight)
        super.readPixels(
          nx,
          ny,
          nWidth,
          nHeight,
          format,
          type,
          subPixels)

        const offset = 4 * (nx - x) + (ny - y) * rowStride
        for (let j = 0; j < nHeight; ++j) {
          for (let i = 0; i < nWidth; ++i) {
            for (let k = 0; k < 4; ++k) {
              pixelData[offset + j * rowStride + 4 * i + k] =
                subPixels[j * nRowStride + 4 * i + k]
            }
          }
        }
      }
    } else {
      super.readPixels(
        x,
        y,
        width,
        height,
        format,
        type,
        pixelData)
    }
  }

  renderbufferStorage (
    target,
    internalFormat,
    width,
    height) {
    target |= 0
    internalFormat |= 0
    width |= 0
    height |= 0

    if (target !== gl.RENDERBUFFER) {
      this.setError(gl.INVALID_ENUM)
      return
    }

    const renderbuffer = this._activeRenderbuffer
    if (!renderbuffer) {
      this.setError(gl.INVALID_OPERATION)
      return
    }

    if (internalFormat !== gl.RGBA4 &&
      internalFormat !== gl.RGB565 &&
      internalFormat !== gl.RGB5_A1 &&
      internalFormat !== gl.DEPTH_COMPONENT16 &&
      internalFormat !== gl.STENCIL_INDEX &&
      internalFormat !== gl.STENCIL_INDEX8 &&
      internalFormat !== gl.DEPTH_STENCIL) {
      this.setError(gl.INVALID_ENUM)
      return
    }

    this._saveError()
    super.renderbufferStorage(
      target,
      internalFormat,
      width,
      height)
    const error = this.getError()
    this._restoreError(error)
    if (error !== gl.NO_ERROR) {
      return
    }

    renderbuffer._width = width
    renderbuffer._height = height
    renderbuffer._format = internalFormat

    const activeFramebuffer = this._activeFramebuffer
    if (activeFramebuffer) {
      let needsUpdate = false
      const attachments = this._getAttachments()
      for (let i = 0; i < attachments.length; ++i) {
        if (activeFramebuffer._attachments[attachments[i]] === renderbuffer) {
          needsUpdate = true
          break
        }
      }
      if (needsUpdate) {
        this._updateFramebufferAttachments(this._activeFramebuffer)
      }
    }
  }

  resize (width, height) {
    width = width | 0
    height = height | 0
    if (!(width > 0 && height > 0)) {
      throw new Error('Invalid surface dimensions')
    } else if (width !== this.drawingBufferWidth ||
      height !== this.drawingBufferHeight) {
      this._resizeDrawingBuffer(width, height)
      this.drawingBufferWidth = width
      this.drawingBufferHeight = height
    }
  }

  sampleCoverage (value, invert) {
    return super.sampleCoverage(+value, !!invert)
  }

  scissor (x, y, width, height) {
    return super.scissor(x | 0, y | 0, width | 0, height | 0)
  }

  shaderSource (shader, source) {
    if (!checkObject(shader)) {
      throw new TypeError('shaderSource(WebGLShader, String)')
    }
    if (!shader || (!source && typeof source !== 'string')) {
      this.setError(gl.INVALID_VALUE)
      return
    }
    source += ''
    if (!isValidString(source)) {
      this.setError(gl.INVALID_VALUE)
    } else if (this._checkWrapper(shader, WebGLShader)) {
      super.shaderSource(shader._ | 0, this._wrapShader(shader._type, source)) // eslint-disable-line
      shader._source = source
    }
  }

  stencilFunc (func, ref, mask) {
    this._checkStencil = true
    return super.stencilFunc(func | 0, ref | 0, mask | 0)
  }

  stencilFuncSeparate (face, func, ref, mask) {
    this._checkStencil = true
    return super.stencilFuncSeparate(face | 0, func | 0, ref | 0, mask | 0)
  }

  stencilMask (mask) {
    this._checkStencil = true
    return super.stencilMask(mask | 0)
  }

  stencilMaskSeparate (face, mask) {
    this._checkStencil = true
    return super.stencilMaskSeparate(face | 0, mask | 0)
  }

  stencilOp (fail, zfail, zpass) {
    this._checkStencil = true
    return super.stencilOp(fail | 0, zfail | 0, zpass | 0)
  }

  stencilOpSeparate (face, fail, zfail, zpass) {
    this._checkStencil = true
    return super.stencilOpSeparate(face | 0, fail | 0, zfail | 0, zpass | 0)
  }

  texImage2D (
    target,
    level,
    internalFormat,
    width,
    height,
    border,
    format,
    type,
    pixels) {
    if (arguments.length === 6) {
      pixels = border
      type = height
      format = width

      pixels = extractImageData(pixels)

      if (pixels == null) {
        throw new TypeError('texImage2D(GLenum, GLint, GLenum, GLint, GLenum, GLenum, ImageData | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement)')
      }

      width = pixels.width
      height = pixels.height
      pixels = pixels.data
    }

    target |= 0
    level |= 0
    internalFormat |= 0
    width |= 0
    height |= 0
    border |= 0
    format |= 0
    type |= 0

    if (typeof pixels !== 'object' && pixels !== undefined) {
      throw new TypeError('texImage2D(GLenum, GLint, GLenum, GLint, GLint, GLint, GLenum, GLenum, Uint8Array)')
    }

    if (!checkFormat(format) || !checkFormat(internalFormat)) {
      this.setError(gl.INVALID_ENUM)
      return
    }

    if (type === gl.FLOAT && !this._extensions.oes_texture_float) {
      this.setError(gl.INVALID_ENUM)
      return
    }

    const texture = this._getTexImage(target)
    if (!texture || format !== internalFormat) {
      this.setError(gl.INVALID_OPERATION)
      return
    }

    const pixelSize = this._computePixelSize(type, format)
    if (pixelSize === 0) {
      return
    }

    if (!this._checkDimensions(
      target,
      width,
      height,
      level)) {
      return
    }

    const data = convertPixels(pixels)
    const rowStride = this._computeRowStride(width, pixelSize)
    const imageSize = rowStride * height

    if (data && data.length < imageSize) {
      this.setError(gl.INVALID_OPERATION)
      return
    }

    if (border !== 0 ||
      (validCubeTarget(target) && width !== height)) {
      this.setError(gl.INVALID_VALUE)
      return
    }
    // Need to check for out of memory error
    this._saveError()
    super.texImage2D(
      target,
      level,
      internalFormat,
      width,
      height,
      border,
      format,
      type,
      data)
    const error = this.getError()
    this._restoreError(error)
    if (error !== gl.NO_ERROR) {
      return
    }

    // Save width and height at level
    texture._levelWidth[level] = width
    texture._levelHeight[level] = height
    texture._format = format
    texture._type = type

    const activeFramebuffer = this._activeFramebuffer
    if (activeFramebuffer) {
      let needsUpdate = false
      const attachments = this._getAttachments()
      for (let i = 0; i < attachments.length; ++i) {
        if (activeFramebuffer._attachments[attachments[i]] === texture) {
          needsUpdate = true
          break
        }
      }
      if (needsUpdate) {
        this._updateFramebufferAttachments(this._activeFramebuffer)
      }
    }
  }

  texSubImage2D (
    target,
    level,
    xoffset,
    yoffset,
    width,
    height,
    format,
    type,
    pixels) {
    if (arguments.length === 7) {
      pixels = format
      type = height
      format = width

      pixels = extractImageData(pixels)

      if (pixels == null) {
        throw new TypeError('texSubImage2D(GLenum, GLint, GLint, GLint, GLenum, GLenum, ImageData | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement)')
      }

      width = pixels.width
      height = pixels.height
      pixels = pixels.data
    }

    if (typeof pixels !== 'object') {
      throw new TypeError('texSubImage2D(GLenum, GLint, GLint, GLint, GLint, GLint, GLenum, GLenum, Uint8Array)')
    }

    target |= 0
    level |= 0
    xoffset |= 0
    yoffset |= 0
    width |= 0
    height |= 0
    format |= 0
    type |= 0

    const texture = this._getTexImage(target)
    if (!texture) {
      this.setError(gl.INVALID_OPERATION)
      return
    }

    if (type === gl.FLOAT && !this._extensions.oes_texture_float) {
      this.setError(gl.INVALID_ENUM)
      return
    }

    const pixelSize = this._computePixelSize(type, format)
    if (pixelSize === 0) {
      return
    }

    if (!this._checkDimensions(
      target,
      width,
      height,
      level)) {
      return
    }

    if (xoffset < 0 || yoffset < 0) {
      this.setError(gl.INVALID_VALUE)
      return
    }

    const data = convertPixels(pixels)
    const rowStride = this._computeRowStride(width, pixelSize)
    const imageSize = rowStride * height

    if (!data || data.length < imageSize) {
      this.setError(gl.INVALID_OPERATION)
      return
    }

    super.texSubImage2D(
      target,
      level,
      xoffset,
      yoffset,
      width,
      height,
      format,
      type,
      data)
  }

  texParameterf (target, pname, param) {
    target |= 0
    pname |= 0
    param = +param

    if (this._checkTextureTarget(target)) {
      this._verifyTextureCompleteness(target, pname, param)
      switch (pname) {
        case gl.TEXTURE_MIN_FILTER:
        case gl.TEXTURE_MAG_FILTER:
        case gl.TEXTURE_WRAP_S:
        case gl.TEXTURE_WRAP_T:
          return super.texParameterf(target, pname, param)
      }

      if (this._extensions.ext_texture_filter_anisotropic && pname === this._extensions.ext_texture_filter_anisotropic.TEXTURE_MAX_ANISOTROPY_EXT) {
        return super.texParameterf(target, pname, param)
      }

      this.setError(gl.INVALID_ENUM)
    }
  }

  texParameteri (target, pname, param) {
    target |= 0
    pname |= 0
    param |= 0

    if (this._checkTextureTarget(target)) {
      this._verifyTextureCompleteness(target, pname, param)
      switch (pname) {
        case gl.TEXTURE_MIN_FILTER:
        case gl.TEXTURE_MAG_FILTER:
        case gl.TEXTURE_WRAP_S:
        case gl.TEXTURE_WRAP_T:
          return super.texParameteri(target, pname, param)
      }

      if (this._extensions.ext_texture_filter_anisotropic && pname === this._extensions.ext_texture_filter_anisotropic.TEXTURE_MAX_ANISOTROPY_EXT) {
        return super.texParameteri(target, pname, param)
      }

      this.setError(gl.INVALID_ENUM)
    }
  }

  useProgram (program) {
    if (!checkObject(program)) {
      throw new TypeError('useProgram(WebGLProgram)')
    } else if (!program) {
      this._switchActiveProgram(this._activeProgram)
      this._activeProgram = null
      return super.useProgram(0)
    } else if (this._checkWrapper(program, WebGLProgram)) {
      if (this._activeProgram !== program) {
        this._switchActiveProgram(this._activeProgram)
        this._activeProgram = program
        program._refCount += 1
      }
      return super.useProgram(program._ | 0)
    }
  }

  validateProgram (program) {
    if (this._checkWrapper(program, WebGLProgram)) {
      super.validateProgram(program._ | 0)
      const error = this.getError()
      if (error === gl.NO_ERROR) {
        program._linkInfoLog = super.getProgramInfoLog(program._ | 0)
      }
      this.getError()
      this.setError(error)
    }
  }

  vertexAttribPointer (
    index,
    size,
    type,
    normalized,
    stride,
    offset) {
    if (stride < 0 || offset < 0) {
      this.setError(gl.INVALID_VALUE)
      return
    }

    index |= 0
    size |= 0
    type |= 0
    normalized = !!normalized
    stride |= 0
    offset |= 0

    if (stride < 0 ||
      offset < 0 ||
      index < 0 || index >= this._vertexObjectState._attribs.length ||
      !(size === 1 || size === 2 || size === 3 || size === 4)) {
      this.setError(gl.INVALID_VALUE)
      return
    }

    if (this._vertexGlobalState._arrayBufferBinding === null) {
      this.setError(gl.INVALID_OPERATION)
      return
    }

    // fixed, int and unsigned int aren't allowed in WebGL
    const byteSize = typeSize(type)
    if (byteSize === 0 ||
      type === gl.INT ||
      type === gl.UNSIGNED_INT) {
      this.setError(gl.INVALID_ENUM)
      return
    }

    if (stride > 255 || stride < 0) {
      this.setError(gl.INVALID_VALUE)
      return
    }

    // stride and offset must be multiples of size
    if ((stride % byteSize) !== 0 ||
      (offset % byteSize) !== 0) {
      this.setError(gl.INVALID_OPERATION)
      return
    }

    // Call vertex attrib pointer
    super.vertexAttribPointer(index, size, type, normalized, stride, offset)

    // Update the vertex state object and references.
    this._vertexObjectState.setVertexAttribPointer(
      /* buffer */ this._vertexGlobalState._arrayBufferBinding,
      /* index */ index,
      /* pointerSize */ size * byteSize,
      /* pointerOffset */ offset,
      /* pointerStride */ stride || (size * byteSize),
      /* pointerType */ type,
      /* pointerNormal */ normalized,
      /* inputStride */ stride,
      /* inputSize */ size
    )
  }

  viewport (x, y, width, height) {
    return super.viewport(x | 0, y | 0, width | 0, height | 0)
  }

  _allocateDrawingBuffer (width, height) {
    this._drawingBuffer = new WebGLDrawingBufferWrapper(
      super.createFramebuffer(),
      super.createTexture(),
      super.createRenderbuffer())

    this._resizeDrawingBuffer(width, height)
  }

  isContextLost () {
    return false
  }

  compressedTexImage2D () {
    // TODO not yet implemented
  }

  compressedTexSubImage2D () {
    // TODO not yet implemented
  }

  _checkUniformValid (location, v0, name, count, type) {
    if (!checkObject(location)) {
      throw new TypeError(`${name}(WebGLUniformLocation, ...)`)
    } else if (!location) {
      return false
    } else if (this._checkLocationActive(location)) {
      const utype = location._activeInfo.type
      if (utype === gl.SAMPLER_2D || utype === gl.SAMPLER_CUBE) {
        if (count !== 1) {
          this.setError(gl.INVALID_VALUE)
          return
        }
        if (type !== 'i') {
          this.setError(gl.INVALID_OPERATION)
          return
        }
        if (v0 < 0 || v0 >= this._textureUnits.length) {
          this.setError(gl.INVALID_VALUE)
          return false
        }
      }
      if (uniformTypeSize(utype) > count) {
        this.setError(gl.INVALID_OPERATION)
        return false
      }
      return true
    }
    return false
  }

  _checkUniformValueValid (location, value, name, count, type) {
    if (!checkObject(location) ||
      !checkObject(value)) {
      throw new TypeError(`${name}v(WebGLUniformLocation, Array)`)
    } else if (!location) {
      return false
    } else if (!this._checkLocationActive(location)) {
      return false
    } else if (typeof value !== 'object' || !value || typeof value.length !== 'number') {
      throw new TypeError(`Second argument to ${name} must be array`)
    } else if (uniformTypeSize(location._activeInfo.type) > count) {
      this.setError(gl.INVALID_OPERATION)
      return false
    } else if (value.length >= count && value.length % count === 0) {
      if (location._array) {
        return true
      } else if (value.length === count) {
        return true
      } else {
        this.setError(gl.INVALID_OPERATION)
        return false
      }
    }
    this.setError(gl.INVALID_VALUE)
    return false
  }

  uniform1f (location, v0) {
    if (!this._checkUniformValid(location, v0, 'uniform1f', 1, 'f')) return
    super.uniform1f(location._ | 0, v0)
  }

  uniform1fv (location, value) {
    if (!this._checkUniformValueValid(location, value, 'uniform1fv', 1, 'f')) return
    if (location._array) {
      const locs = location._array
      for (let i = 0; i < locs.length && i < value.length; ++i) {
        const loc = locs[i]
        super.uniform1f(loc, value[i])
      }
      return
    }
    super.uniform1f(location._ | 0, value[0])
  }

  uniform1i (location, v0) {
    if (!this._checkUniformValid(location, v0, 'uniform1i', 1, 'i')) return
    super.uniform1i(location._ | 0, v0)
  }

  uniform1iv (location, value) {
    if (!this._checkUniformValueValid(location, value, 'uniform1iv', 1, 'i')) return
    if (location._array) {
      const locs = location._array
      for (let i = 0; i < locs.length && i < value.length; ++i) {
        const loc = locs[i]
        super.uniform1i(loc, value[i])
      }
      return
    }
    this.uniform1i(location, value[0])
  }

  uniform2f (location, v0, v1) {
    if (!this._checkUniformValid(location, v0, 'uniform2f', 2, 'f')) return
    super.uniform2f(location._ | 0, v0, v1)
  }

  uniform2fv (location, value) {
    if (!this._checkUniformValueValid(location, value, 'uniform2fv', 2, 'f')) return
    if (location._array) {
      const locs = location._array
      for (let i = 0; i < locs.length && 2 * i < value.length; ++i) {
        const loc = locs[i]
        super.uniform2f(loc, value[2 * i], value[(2 * i) + 1])
      }
      return
    }
    super.uniform2f(location._ | 0, value[0], value[1])
  }

  uniform2i (location, v0, v1) {
    if (!this._checkUniformValid(location, v0, 'uniform2i', 2, 'i')) return
    super.uniform2i(location._ | 0, v0, v1)
  }

  uniform2iv (location, value) {
    if (!this._checkUniformValueValid(location, value, 'uniform2iv', 2, 'i')) return
    if (location._array) {
      const locs = location._array
      for (let i = 0; i < locs.length && 2 * i < value.length; ++i) {
        const loc = locs[i]
        super.uniform2i(loc, value[2 * i], value[2 * i + 1])
      }
      return
    }
    this.uniform2i(location, value[0], value[1])
  }

  uniform3f (location, v0, v1, v2) {
    if (!this._checkUniformValid(location, v0, 'uniform3f', 3, 'f')) return
    super.uniform3f(location._ | 0, v0, v1, v2)
  }

  uniform3fv (location, value) {
    if (!this._checkUniformValueValid(location, value, 'uniform3fv', 3, 'f')) return
    if (location._array) {
      const locs = location._array
      for (let i = 0; i < locs.length && 3 * i < value.length; ++i) {
        const loc = locs[i]
        super.uniform3f(loc, value[3 * i], value[3 * i + 1], value[3 * i + 2])
      }
      return
    }
    super.uniform3f(location._ | 0, value[0], value[1], value[2])
  }

  uniform3i (location, v0, v1, v2) {
    if (!this._checkUniformValid(location, v0, 'uniform3i', 3, 'i')) return
    super.uniform3i(location._ | 0, v0, v1, v2)
  }

  uniform3iv (location, value) {
    if (!this._checkUniformValueValid(location, value, 'uniform3iv', 3, 'i')) return
    if (location._array) {
      const locs = location._array
      for (let i = 0; i < locs.length && 3 * i < value.length; ++i) {
        const loc = locs[i]
        super.uniform3i(loc, value[3 * i], value[3 * i + 1], value[3 * i + 2])
      }
      return
    }
    this.uniform3i(location, value[0], value[1], value[2])
  }

  uniform4f (location, v0, v1, v2, v3) {
    if (!this._checkUniformValid(location, v0, 'uniform4f', 4, 'f')) return
    super.uniform4f(location._ | 0, v0, v1, v2, v3)
  }

  uniform4fv (location, value) {
    if (!this._checkUniformValueValid(location, value, 'uniform4fv', 4, 'f')) return
    if (location._array) {
      const locs = location._array
      for (let i = 0; i < locs.length && 4 * i < value.length; ++i) {
        const loc = locs[i]
        super.uniform4f(loc, value[4 * i], value[4 * i + 1], value[4 * i + 2], value[4 * i + 3])
      }
      return
    }
    super.uniform4f(location._ | 0, value[0], value[1], value[2], value[3])
  }

  uniform4i (location, v0, v1, v2, v3) {
    if (!this._checkUniformValid(location, v0, 'uniform4i', 4, 'i')) return
    super.uniform4i(location._ | 0, v0, v1, v2, v3)
  }

  uniform4iv (location, value) {
    if (!this._checkUniformValueValid(location, value, 'uniform4iv', 4, 'i')) return
    if (location._array) {
      const locs = location._array
      for (let i = 0; i < locs.length && 4 * i < value.length; ++i) {
        const loc = locs[i]
        super.uniform4i(loc, value[4 * i], value[4 * i + 1], value[4 * i + 2], value[4 * i + 3])
      }
      return
    }
    this.uniform4i(location, value[0], value[1], value[2], value[3])
  }

  _checkUniformMatrix (location, transpose, value, name, count) {
    if (!checkObject(location) ||
      typeof value !== 'object') {
      throw new TypeError(name + '(WebGLUniformLocation, Boolean, Array)')
    } else if (!!transpose ||
      typeof value !== 'object' ||
      value === null ||
      !value.length ||
      value.length % count * count !== 0) {
      this.setError(gl.INVALID_VALUE)
      return false
    }
    if (!location) {
      return false
    }
    if (!this._checkLocationActive(location)) {
      return false
    }

    if (value.length === count * count) {
      return true
    } else if (location._array) {
      return true
    }
    this.setError(gl.INVALID_VALUE)
    return false
  }

  uniformMatrix2fv (location, transpose, value) {
    if (!this._checkUniformMatrix(location, transpose, value, 'uniformMatrix2fv', 2)) return
    const data = new Float32Array(value)
    super.uniformMatrix2fv(
      location._ | 0,
      !!transpose,
      data)
  }

  uniformMatrix3fv (location, transpose, value) {
    if (!this._checkUniformMatrix(location, transpose, value, 'uniformMatrix3fv', 3)) return
    const data = new Float32Array(value)
    super.uniformMatrix3fv(
      location._ | 0,
      !!transpose,
      data)
  }

  uniformMatrix4fv (location, transpose, value) {
    if (!this._checkUniformMatrix(location, transpose, value, 'uniformMatrix4fv', 4)) return
    const data = new Float32Array(value)
    super.uniformMatrix4fv(
      location._ | 0,
      !!transpose,
      data)
  }

  vertexAttrib1f (index, v0) {
    index |= 0
    if (!this._checkVertexIndex(index)) return
    const data = this._vertexGlobalState._attribs[index]._data
    data[3] = 1
    data[1] = data[2] = 0
    data[0] = v0
    return super.vertexAttrib1f(index | 0, +v0)
  }

  vertexAttrib2f (index, v0, v1) {
    index |= 0
    if (!this._checkVertexIndex(index)) return
    const data = this._vertexGlobalState._attribs[index]._data
    data[3] = 1
    data[2] = 0
    data[1] = v1
    data[0] = v0
    return super.vertexAttrib2f(index | 0, +v0, +v1)
  }

  vertexAttrib3f (index, v0, v1, v2) {
    index |= 0
    if (!this._checkVertexIndex(index)) return
    const data = this._vertexGlobalState._attribs[index]._data
    data[3] = 1
    data[2] = v2
    data[1] = v1
    data[0] = v0
    return super.vertexAttrib3f(index | 0, +v0, +v1, +v2)
  }

  vertexAttrib4f (index, v0, v1, v2, v3) {
    index |= 0
    if (!this._checkVertexIndex(index)) return
    const data = this._vertexGlobalState._attribs[index]._data
    data[3] = v3
    data[2] = v2
    data[1] = v1
    data[0] = v0
    return super.vertexAttrib4f(index | 0, +v0, +v1, +v2, +v3)
  }

  vertexAttrib1fv (index, value) {
    if (typeof value !== 'object' || value === null || value.length < 1) {
      this.setError(gl.INVALID_OPERATION)
      return
    }
    const data = this._vertexGlobalState._attribs[index]._data
    data[3] = 1
    data[2] = 0
    data[1] = 0
    data[0] = value[0]
    return super.vertexAttrib1f(index | 0, +value[0])
  }

  vertexAttrib2fv (index, value) {
    if (typeof value !== 'object' || value === null || value.length < 2) {
      this.setError(gl.INVALID_OPERATION)
      return
    }
    const data = this._vertexGlobalState._attribs[index]._data
    data[3] = 1
    data[2] = 0
    data[1] = value[1]
    data[0] = value[0]
    return super.vertexAttrib2f(index | 0, +value[0], +value[1])
  }

  vertexAttrib3fv (index, value) {
    if (typeof value !== 'object' || value === null || value.length < 3) {
      this.setError(gl.INVALID_OPERATION)
      return
    }
    const data = this._vertexGlobalState._attribs[index]._data
    data[3] = 1
    data[2] = value[2]
    data[1] = value[1]
    data[0] = value[0]
    return super.vertexAttrib3f(index | 0, +value[0], +value[1], +value[2])
  }

  vertexAttrib4fv (index, value) {
    if (typeof value !== 'object' || value === null || value.length < 4) {
      this.setError(gl.INVALID_OPERATION)
      return
    }
    const data = this._vertexGlobalState._attribs[index]._data
    data[3] = value[3]
    data[2] = value[2]
    data[1] = value[1]
    data[0] = value[0]
    return super.vertexAttrib4f(index | 0, +value[0], +value[1], +value[2], +value[3])
  }
}

module.exports = { WebGLRenderingContext, wrapContext }
