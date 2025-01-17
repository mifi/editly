#/bin/bash
set -ex

node ../dist/cli.js --json gl.json5
node ../dist/cli.js --json image.json5
node ../dist/cli.js --json speedTest.json5
node ../dist/cli.js --json subtitle.json5
node ../dist/cli.js --json transitionEasing.json5
node ../dist/cli.js --json transparentGradient.json5
node ../dist/cli.js --json commonFeatures.json5
