const execa = require('execa');

// todo use jest

(async () => {
  try {
    await execa('node', [
      'cli.js',
      '--allow-remote-requests',
      "title:'My video'",
      'https://raw.githubusercontent.com/mifi/editly-assets/main/overlay.svg',
      "title:'THE END'",
      '--fast',
      '--audio-file-path',
      'https://github.com/mifi/editly-assets/raw/main/winxp.mp3',
    ], { stdout: process.stdout, stderr: process.stderr });
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
})();
