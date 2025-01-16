import { execa } from 'execa';

// todo use jest
await execa('npx', [
  'tsx',
  'src/cli.ts',
  '--allow-remote-requests',
  "title:'My video'",
  'https://raw.githubusercontent.com/mifi/editly-assets/main/overlay.svg',
  "title:'THE END'",
  '--fast',
  '--audio-file-path',
  'https://github.com/mifi/editly-assets/raw/main/winxp.mp3',
], { stdout: process.stdout, stderr: process.stderr });
