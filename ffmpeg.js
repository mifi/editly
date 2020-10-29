const fs = require('fs-extra');
const execa = require('execa');
const assert = require('assert');
const gte = require('semver/functions/gte');

const getFfmpegCommonArgs = ({ enableFfmpegLog }) => (enableFfmpegLog ? [] : ['-hide_banner', '-loglevel', 'error']);

const getCutFromArgs = ({ cutFrom }) => (cutFrom ? ['-ss', cutFrom] : []);

const getCutToArgs = ({ cutTo, cutFrom, speedFactor }) => (cutTo ? ['-t', (cutTo - cutFrom) * speedFactor] : []);

async function createConcatFile(segments, concatFilePath) {
  // https://superuser.com/questions/787064/filename-quoting-in-ffmpeg-concat
  await fs.writeFile(concatFilePath, segments.map((seg) => `file '${seg.replace(/'/g, "'\\''")}'`).join('\n'));
}

async function testFf(exePath, name) {
  const requiredVersion = '4.3.1';

  try {
    const { stdout } = await execa(exePath, ['-version']);
    const firstLine = stdout.split('\n')[0];
    const match = firstLine.match(`${name} version ([0-9.]+)`);
    assert(match, 'Unknown version string');
    const versionStr = match[1];
    console.log(`${name} version ${versionStr}`);
    assert(gte(versionStr, requiredVersion), 'Version is outdated');
  } catch (err) {
    console.error(`WARNING: ${name} issue:`, err.message);
  }
}

module.exports = {
  getFfmpegCommonArgs,
  getCutFromArgs,
  getCutToArgs,
  createConcatFile,
  testFf,
};
