# editly

Editly is a tool and framework for declarative NLE (non-linear video editing) using Node.js and ffmpeg. It allows you to **easily and programmatically** create a video from set of clips, images and titles, with smooth transitions between.

There is a simple command line for quickly assembling a video from a set of clips or images, or you can use it from Javascript!

Inspired by [ffmpeg-concat](https://github.com/transitive-bullshit/ffmpeg-concat). The problem with that project is that it is quite slow and uses an extreme amount of disk space, especially for HD/4K videos. This projects solves that by doing **streaming** editing, so it doesn't store any temporary files.

[![demo](https://github.com/mifi/gifs/raw/master/commonFeatures.gif)](https://youtu.be/LNeclLkxUEY)

This GIF/youtube was created with this command: "editly [commonFeatures.json5](https://github.com/mifi/editly/blob/master/examples/commonFeatures.json5)

https://youtu.be/LNeclLkxUEY

## Requirements

- [Node.js installed](https://nodejs.org/en/) (Recommended to use newest stable version)
- Should work on Windows, MacOS and Linux. Needs at least Node.js v12.16.2 on MacOS ([see issue](https://github.com/sindresorhus/meow/issues/144)). See also https://github.com/stackgl/headless-gl#system-dependencies

Make sure you have `ffmpeg` and `ffprobe` installed and available in `PATH`

## Installing

`npm i -g editly`

## Usage: Command line video editor

Run `editly --help` for usage

Create a simple randomized video edit from videos, images and text with an audio track:

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
```

Or create a GIF (or MP4) from a JSON or JSON5 edit spec *(JSON5 is just a more friendly JSON format)*:

```sh
editly my-editly.json5 --out output.gif
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

## Use cases

- Create a slideshow from a set of pictures with text overlay
- Create a fast paced video trailer with clips
- Create a tutorial video
- Simply convert a video to a GIF

See [examples](https://github.com/mifi/editly/tree/master/examples)

## Features

- Supports any size like 4K video and DSLR photos
- Can output to any dimensions, like Instagram post, Instagram story 9:16, YouTube 16:9, or any other dimensions you like. Content will be scaled and letterboxed automatically, even if aspect ratio is not correct.
- Automatically converts frame rate
- Accepts custom HTML5 Canvas / Fabric.js Javascript code for custom screens or dynamic overlays


## TODO

- Implement audio from source files
- Allow specifying path to ffmpeg and ffprobe
- Full power of the HTML to create visuals and animations (maybe puppeteer)
- three.js

## See also

- [LosslessCut](https://github.com/mifi/lossless-cut)
