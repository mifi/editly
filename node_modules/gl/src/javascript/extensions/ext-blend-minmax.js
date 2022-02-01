class EXTBlendMinMax {
  constructor () {
    this.MIN_EXT = 0x8007
    this.MAX_EXT = 0x8008
  }
}

function getEXTBlendMinMax (context) {
  let result = null
  const exts = context.getSupportedExtensions()

  if (exts && exts.indexOf('EXT_blend_minmax') >= 0) {
    result = new EXTBlendMinMax()
  }

  return result
}

module.exports = { getEXTBlendMinMax, EXTBlendMinMax }
