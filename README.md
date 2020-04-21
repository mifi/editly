# editly

Editly is a framework for declarative NLE (non-linear video editing) using Node.js and ffmpeg. It allows you to **easily and programmatically** create a video from set of videos, images and titles, with smooth transitions between.

Also provides a simple command line for quickly assembling a video.

Inspired by [ffmpeg-concat](https://github.com/transitive-bullshit/ffmpeg-concat). The problem with that project is that it uses an extreme amount of disk space, especially for HD/4K videos. This projects solves that by doing **streaming** editing, so it doesn't store any temporary files.

## Requirements

- [Node.js installed](https://nodejs.org/en/) (Recommended to use newest stable version)
- Should work on Windows, MacOS and Linux. The command line utility needs at least Node.js v12.16.2 ([see issue](https://github.com/sindresorhus/meow/issues/144)). See also https://github.com/stackgl/headless-gl#system-dependencies

Make sure you have `ffmpeg` and `ffprobe` installed and available in `PATH`

## Installing

`npm i -g editly`

## CLI video editor

Run `editly --help` for usage

Create a simple randomized video edit from videos, images and text
```sh
editly \
  title:'My video' \
  clip1.mov \
  clip2.mov \
  title:'My slideshow' \
  img1.jpg \
  img2.jpg \
  title:'THE END' \
  --audio-file-path /path/to/music.mp3 \
  --font-path /path/to/my-favorite-font.ttf
```

Or create a GIF (or MP4) from a JSON edit spec

```
editly --json my-editly.json --out output.gif
```

For examples of how to make an JSON edit spec, see https://github.com/mifi/editly/tree/master/examples

By default it will use the **width**, **height** and **frame rate** from the **first** input video. **all other clips will be converted to these dimensions** You can override these parameters however.

**TIP:** Run with `--fast` or `fast: true` first to improve speed while testing


## Javascript library

```js
const editly = require('editly');

// See editSpec documentation
await editly(editSpec)
  .catch(console.error);
```

## Features

- Custom Canvas/Fabric.js rendering
- Can output the same video to multiple sizes, like Instagram post, Instagram story 9:16, YouTube 16:9, or any dimensions you like
- TODO add more

## TODO

- Implement audio from source files
- Allow specifying path to ffmpeg and ffprobe
- Full power of the HTML to create visuals and animations (maybe puppeteer)
- three.js

## See also

- [LosslessCut](https://github.com/mifi/lossless-cut)
