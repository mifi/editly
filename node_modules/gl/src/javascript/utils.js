const { gl } = require('./native-gl')

const { WebGLUniformLocation } = require('./webgl-uniform-location')

function bindPublics (props, wrapper, privateInstance, privateMethods) {
  for (let i = 0; i < props.length; i++) {
    const prop = props[i]
    const value = privateInstance[prop]
    if (typeof value === 'function') {
      if (privateMethods.indexOf(prop) === -1) {
        wrapper[prop] = value.bind(privateInstance)
      }
    } else {
      if (prop[0] === '_' ||
        prop[0] === '0' ||
        prop[0] === '1') {
        continue
      }
      wrapper[prop] = value
    }
  }
}

function checkObject (object) {
  return typeof object === 'object' ||
    (object === undefined)
}

function checkUniform (program, location) {
  return location instanceof WebGLUniformLocation &&
    location._program === program &&
    location._linkCount === program._linkCount
}

function isTypedArray (data) {
  return data instanceof Uint8Array ||
    data instanceof Uint8ClampedArray ||
    data instanceof Int8Array ||
    data instanceof Uint16Array ||
    data instanceof Int16Array ||
    data instanceof Uint32Array ||
    data instanceof Int32Array ||
    data instanceof Float32Array ||
    data instanceof Float64Array
}

// Don't allow: ", $, `, @, \, ', \0
function isValidString (str) {
  // Remove comments first
  const c = str.replace(/(?:\/\*(?:[\s\S]*?)\*\/)|(?:([\s;])+\/\/(?:.*)$)/gm, '')
  return !(/["$`@\\'\0]/.test(c))
}

function vertexCount (primitive, count) {
  switch (primitive) {
    case gl.TRIANGLES:
      return count - (count % 3)
    case gl.LINES:
      return count - (count % 2)
    case gl.LINE_LOOP:
    case gl.POINTS:
      return count
    case gl.TRIANGLE_FAN:
    case gl.LINE_STRIP:
      if (count < 2) {
        return 0
      }
      return count
    case gl.TRIANGLE_STRIP:
      if (count < 3) {
        return 0
      }
      return count
    default:
      return -1
  }
}

function typeSize (type) {
  switch (type) {
    case gl.UNSIGNED_BYTE:
    case gl.BYTE:
      return 1
    case gl.UNSIGNED_SHORT:
    case gl.SHORT:
      return 2
    case gl.UNSIGNED_INT:
    case gl.INT:
    case gl.FLOAT:
      return 4
  }
  return 0
}

function uniformTypeSize (type) {
  switch (type) {
    case gl.BOOL_VEC4:
    case gl.INT_VEC4:
    case gl.FLOAT_VEC4:
      return 4

    case gl.BOOL_VEC3:
    case gl.INT_VEC3:
    case gl.FLOAT_VEC3:
      return 3

    case gl.BOOL_VEC2:
    case gl.INT_VEC2:
    case gl.FLOAT_VEC2:
      return 2

    case gl.BOOL:
    case gl.INT:
    case gl.FLOAT:
    case gl.SAMPLER_2D:
    case gl.SAMPLER_CUBE:
      return 1

    default:
      return 0
  }
}

function unpackTypedArray (array) {
  return (new Uint8Array(array.buffer)).subarray(
    array.byteOffset,
    array.byteLength + array.byteOffset)
}

function extractImageData (pixels) {
  if (typeof pixels === 'object' && typeof pixels.width !== 'undefined' && typeof pixels.height !== 'undefined') {
    if (typeof pixels.data !== 'undefined') {
      return pixels
    }

    let context = null

    if (typeof pixels.getContext === 'function') {
      context = pixels.getContext('2d')
    } else if (typeof pixels.src !== 'undefined' && typeof document === 'object' && typeof document.createElement === 'function') {
      const canvas = document.createElement('canvas')

      if (typeof canvas === 'object' && typeof canvas.getContext === 'function') {
        context = canvas.getContext('2d')

        if (context !== null) {
          context.drawImage(pixels, 0, 0)
        }
      }
    }

    if (context !== null) {
      return context.getImageData(0, 0, pixels.width, pixels.height)
    }
  }

  return null
}

function formatSize (internalFormat) {
  switch (internalFormat) {
    case gl.ALPHA:
    case gl.LUMINANCE:
      return 1
    case gl.LUMINANCE_ALPHA:
      return 2
    case gl.RGB:
      return 3
    case gl.RGBA:
      return 4
  }
  return 0
}

function convertPixels (pixels) {
  if (typeof pixels === 'object' && pixels !== null) {
    if (pixels instanceof ArrayBuffer) {
      return new Uint8Array(pixels)
    } else if (pixels instanceof Uint8Array ||
      pixels instanceof Uint16Array ||
      pixels instanceof Uint8ClampedArray ||
      pixels instanceof Float32Array) {
      return unpackTypedArray(pixels)
    } else if (pixels instanceof Buffer) {
      return new Uint8Array(pixels)
    }
  }
  return null
}

function checkFormat (format) {
  return (
    format === gl.ALPHA ||
    format === gl.LUMINANCE_ALPHA ||
    format === gl.LUMINANCE ||
    format === gl.RGB ||
    format === gl.RGBA)
}

function validCubeTarget (target) {
  return target === gl.TEXTURE_CUBE_MAP_POSITIVE_X ||
    target === gl.TEXTURE_CUBE_MAP_NEGATIVE_X ||
    target === gl.TEXTURE_CUBE_MAP_POSITIVE_Y ||
    target === gl.TEXTURE_CUBE_MAP_NEGATIVE_Y ||
    target === gl.TEXTURE_CUBE_MAP_POSITIVE_Z ||
    target === gl.TEXTURE_CUBE_MAP_NEGATIVE_Z
}

module.exports = {
  bindPublics,
  checkObject,
  isTypedArray,
  isValidString,
  vertexCount,
  typeSize,
  uniformTypeSize,
  unpackTypedArray,
  extractImageData,
  formatSize,
  checkFormat,
  checkUniform,
  convertPixels,
  validCubeTarget
}
