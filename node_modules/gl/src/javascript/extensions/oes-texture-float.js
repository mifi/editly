class OESTextureFloat {}

function getOESTextureFloat (context) {
  let result = null
  const exts = context.getSupportedExtensions()

  if (exts && exts.indexOf('OES_texture_float') >= 0) {
    result = new OESTextureFloat()
  }

  return result
}

module.exports = { getOESTextureFloat, OESTextureFloat }
