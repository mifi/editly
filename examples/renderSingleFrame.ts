import JSON from 'json5';
import fsExtra from 'fs-extra';
import { renderSingleFrame } from 'editly';

(async () => {
  await renderSingleFrame({
    time: 0,
    clips: JSON.parse(await fsExtra.readFile('./videos.json5', 'utf-8')).clips,
    outPath: 'renderSingleFrame.png'
  });
})().catch(console.error);
