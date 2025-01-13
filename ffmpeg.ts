import fsExtra from 'fs-extra';
import { execa } from 'execa';
import assert from 'assert';
import { compareVersions } from 'compare-versions';

export function getFfmpegCommonArgs({ enableFfmpegLog }: { enableFfmpegLog?: boolean }) {
  return enableFfmpegLog ? [] : ['-hide_banner', '-loglevel', 'error'];
}

export function getCutFromArgs({ cutFrom }: { cutFrom?: number }) {
  return cutFrom ? ['-ss', cutFrom.toString()] : [];
}

export function getCutToArgs({ cutTo, cutFrom, speedFactor }: { cutTo?: number; cutFrom?: number; speedFactor: number }) {
  return cutFrom && cutTo ? ['-t', (cutTo - cutFrom) * speedFactor] : [];
}

export async function createConcatFile(segments: string[], concatFilePath: string) {
  // https://superuser.com/questions/787064/filename-quoting-in-ffmpeg-concat
  await fsExtra.writeFile(concatFilePath, segments.map((seg) => `file '${seg.replace(/'/g, "'\\''")}'`).join('\n'));
}

export async function testFf(exePath: string, name: string) {
  const minRequiredVersion = '4.3.1';

  try {
    const { stdout } = await execa(exePath, ['-version']);
    const firstLine = stdout.split('\n')[0];
    const match = firstLine.match(`${name} version ([0-9.]+)`);
    assert(match, 'Unknown version string');
    const versionStr = match[1];
    console.log(`${name} version ${versionStr}`);
    assert(compareVersions(versionStr, minRequiredVersion), 'Version is outdated');
  } catch (err) {
    console.error(`WARNING: ${name}:`, err);
  }
}
