const JSON5 = require('json5');
const fs = require('fs-extra');

const { renderSingleFrame } = require('..');

(async () => {
  await renderSingleFrame({
    time: 0,
    clips: JSON5.parse(await fs.readFile('./videos.json5', 'utf-8')).clips,
  });
})().catch(console.error);
