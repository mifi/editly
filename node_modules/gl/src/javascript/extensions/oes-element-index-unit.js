class OESElementIndexUint {}

function getOESElementIndexUint (context) {
  let result = null
  const exts = context.getSupportedExtensions()

  if (exts && exts.indexOf('OES_element_index_uint') >= 0) {
    result = new OESElementIndexUint()
  }

  return result
}

module.exports = { getOESElementIndexUint, OESElementIndexUint }
