class OESTextureFloatLinear {}

function getOESTextureFloatLinear (context) {
  let result = null
  const exts = context.getSupportedExtensions()

  if (exts && exts.indexOf('OES_texture_float_linear') >= 0) {
    result = new OESTextureFloatLinear()
  }

  return result
}

module.exports = { getOESTextureFloatLinear, OESTextureFloatLinear }
