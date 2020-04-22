#/bin/bash
set -e

node ../cli.js --json gl.json5
node ../cli.js --json image.json5
node ../cli.js --json losslesscut.json5
node ../cli.js --json resizeHorizontal.json5
node ../cli.js --json resizeVertical.json5
node ../cli.js --json speedTest.json5
node ../cli.js --json subtitle.json5
node ../cli.js --json transitionEasing.json5
node ../cli.js --json transparentGradient.json5
node ../cli.js --json commonFeatures.json5
