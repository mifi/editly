import fsExtra from 'fs-extra';
import { execa } from 'execa';
import assert from 'assert';
import compareVersions from 'compare-versions';

export const getFfmpegCommonArgs = ({ enableFfmpegLog }) => (enableFfmpegLog ? [] : ['-hide_banner', '-loglevel', 'error']);

export const getCutFromArgs = ({ cutFrom }) => (cutFrom ? ['-ss', cutFrom] : []);

export const getCutToArgs = ({ cutTo, cutFrom, speedFactor }) => (cutTo ? ['-t', (cutTo - cutFrom) * speedFactor] : []);

export async function createConcatFile(segments, concatFilePath) {
  // https://superuser.com/questions/787064/filename-quoting-in-ffmpeg-concat
  await fsExtra.writeFile(concatFilePath, segments.map((seg) => `file '${seg.replace(/'/g, "'\\''")}'`).join('\n'));
}

export async function testFf(exePath, name) {
  const minRequiredVersion = '4.3.1';

  try {
    const { stdout } = await execa(exePath, ['-version']);
    const firstLine = stdout.split('\n')[0];
    const match = firstLine.match(`${name} version ([0-9.]+)`);
    assert(match, 'Unknown version string');
    const versionStr = match[1];
    console.log(`${name} version ${versionStr}`);
    assert(compareVersions(versionStr, minRequiredVersion, '>='), 'Version is outdated');
  } catch (err) {
    console.error(`WARNING: ${name}:`, err.message);
  }
}
