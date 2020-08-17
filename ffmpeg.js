const fs = require('fs-extra');

const getFfmpegCommonArgs = ({ enableFfmpegLog }) => (enableFfmpegLog ? [] : ['-hide_banner', '-loglevel', 'error']);

const getCutFromArgs = ({ cutFrom }) => (cutFrom ? ['-ss', cutFrom] : []);

const getCutToArgs = ({ cutTo, cutFrom, framePtsFactor }) => (cutTo ? ['-t', (cutTo - cutFrom) * framePtsFactor] : []);

async function createConcatFile(segments, concatFilePath) {
  // https://superuser.com/questions/787064/filename-quoting-in-ffmpeg-concat
  await fs.writeFile(concatFilePath, segments.map((seg) => `file '${seg.replace(/'/g, "'\\''")}'`).join('\n'));
}

module.exports = {
  getFfmpegCommonArgs,
  getCutFromArgs,
  getCutToArgs,
  createConcatFile,
};
