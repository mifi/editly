#!/usr/bin/env node
const meow = require('meow');
const fs = require('fs');
const FileType = require('file-type');
const pMap = require('p-map');
const JSON5 = require('json5');
const assert = require('assert');

const editly = require('.');

// See also readme
const cli = meow(`
  Usage
    $ editly CLIP1 [CLIP2 [CLIP3 ...]]
    where each CLIP can be one of the following:
      - A path to a video file
      - A path to an image
      - A quoted text to show in a title screen, prefixed by "title:"

  Or alternatively:
    $ editly --json JSON_PATH
    where JSON_PATH is the path to an edit spec JSON file, can be a normal JSON or JSON5

  Options
    --out  Out video path (defaults to ./editly-out.mp4) - can also be a .gif
    --json  Use JSON edit spec
    --transition-name  Name of default transition to use (default: random)
    --transition-duration  Default transition duration
    --clip-duration  Default clip duration
    --width  Width which all media will be converted to
    --height  Height which all media will be converted to
    --fps  FPS which all videos will be converted to
    --font-path  Set default font to a .ttf
    --audio-file-path  Add an audio track
    --keep-source-audio  Keep audio from source files

    --fast, -f  Fast mode (low resolution and FPS, useful for getting a quick preview)
    --verbose, -v

  For more detailed explanation, see:
  https://github.com/mifi/editly

  Examples
    $ editly title:'My video' clip1.mov clip2.mov title:'My slideshow' img1.jpg img2.jpg title:'THE END' --audio-file-path /path/to/music.mp3 --font-path /path/to/my-favorite-font.ttf
    $ editly my-editly.json5 --out output.gif
`, {
  flags: {
    verbose: { type: 'boolean', alias: 'v' },
    keepSourceAudio: { type: 'boolean' },
    fast: { type: 'boolean', alias: 'f' },
    transitionDuration: { type: 'number' },
    clipDuration: { type: 'number' },
    width: { type: 'number' },
    height: { type: 'number' },
    fps: { type: 'number' },
  },
});

(async () => {
  let { json } = cli.flags;
  // eslint-disable-next-line prefer-destructuring
  if (cli.input.length === 1 && /\.(json|json5|js)$/.test(cli.input[0].toLowerCase())) json = cli.input[0];

  let params = {
    defaults: {},
  };

  if (json) {
    params = JSON5.parse(fs.readFileSync(json, 'utf-8'));
  } else {
    const clipsIn = cli.input;
    if (clipsIn.length < 1) cli.showHelp();

    const clips = await pMap(clipsIn, async (clip) => {
      const match = clip.match(/^title:(.+)$/);
      if (match) return { type: 'title-background', text: match[1] };

      const fileType = await FileType.fromFile(clip);
      if (!fileType) {
        console.error('Invalid file for clip', clip);
        cli.showHelp();
      }

      const { mime } = fileType;

      if (mime.startsWith('video')) return { type: 'video', path: clip };
      if (mime.startsWith('image')) return { type: 'image', path: clip };

      throw new Error(`Unrecognized clip or file type "${clip}"`);
    }, { concurrency: 1 });

    assert(clips.length > 0, 'No clips specified');

    params.clips = clips.map((clip) => ({ layers: [clip] }));
  }

  const { verbose, transitionName, transitionDuration, clipDuration, width, height, fps, audioFilePath, fontPath, fast, out: outPath, keepSourceAudio } = cli.flags;

  if (transitionName || transitionDuration != null) {
    params.defaults.transition = {};
    if (transitionName) params.defaults.transition.name = transitionName;
    if (transitionDuration) params.defaults.transition.duration = transitionDuration;
  }

  if (clipDuration) params.defaults.duration = clipDuration;

  if (fontPath) {
    params.defaults.layer = {
      fontPath,
    };
  }

  if (outPath) params.outPath = outPath;
  if (audioFilePath) params.audioFilePath = audioFilePath;
  if (keepSourceAudio) params.keepSourceAudio = true;
  if (width) params.width = width;
  if (height) params.height = height;
  if (fps) params.fps = fps;

  if (fast) params.fast = fast;
  if (verbose) params.verbose = verbose;

  if (params.verbose) console.log(JSON5.stringify(params, null, 2));

  if (!params.outPath) params.outPath = './editly-out.mp4';

  await editly(params);
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
