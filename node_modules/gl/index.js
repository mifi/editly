if (typeof WebGLRenderingContext !== 'undefined') {
  module.exports = require('./src/javascript/browser-index')
} else {
  module.exports = require('./src/javascript/node-index')
}
