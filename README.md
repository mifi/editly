# editly 🏄‍♀️

[![demo](https://github.com/mifi/gifs/raw/master/commonFeatures.gif)](https://youtu.be/LNeclLkxUEY)

This GIF / YouTube was created with this command: "editly [commonFeatures.json5](https://github.com/mifi/editly/blob/master/examples/commonFeatures.json5)". See [more examples here](https://github.com/mifi/editly/tree/master/examples#examples).

**Editly** is a tool and framework for declarative NLE (**non-linear video editing**) using Node.js and ffmpeg. Editly allows you to easily and **programmatically create a video** from **set of clips, images and titles**, with smooth transitions between and music overlaid.

Editly has a simple CLI for quickly assembling a video from a set of clips or images, or you can use its more flexible Javascript API.

Inspired by [ffmpeg-concat](https://github.com/transitive-bullshit/ffmpeg-concat), editly is much faster and doesn't require much storage because it uses **streaming** editing. Editly aims to be very extensible and feature rich with a pluggable interface for adding new **dynamic content**.

## Features

- Edit videos with code! Declarative API with fun defaults
- Create colorful videos with random colors generated from aesthetically pleasing pallettes and random effects
- Supports any input size like 4K video and DSLR photos
- Can output to any dimensions and aspect ratio, like *Instagram post* (1:1), *Instagram story* (9:16), *YouTube* (16:9), or any other dimensions you like.
- Content will be scaled and letterboxed automatically, even if input aspect ratio is not same, and framerate will be converted.
- Speeds up / slow down videos automatically to match `cutFrom`/`cutTo` segment length with each clip's `duration`
- Overlay text and subtitles on videos, images or backgrounds
- Accepts custom HTML5 Canvas / Fabric.js Javascript code for custom screens or dynamic overlays
- Render custom GL shaders (for example from [shadertoy](https://www.shadertoy.com/))
- Can output GIF

## Use cases

- Create a slideshow from a set of pictures with text overlay
- Create a fast paced trailer or promo video
- Create a tutorial video with help text
- Simply convert a video to a GIF
- Resize video to any size or framerate and with automatic letterbox/crop (e.g. if you need to upload a video somewhere but the site complains `Video must be 1337x1000 30fps`)

See [examples](https://github.com/mifi/editly/tree/master/examples)

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
  --fast \
  --audio-file-path /path/to/music.mp3
```

Or create an MP4 (or GIF) from a JSON or JSON5 edit spec *(JSON5 is just a more friendly JSON format)*:

```sh
editly my-editly.json5 --fast --out output.gif
```

For examples of how to make an JSON edit spec, see below or https://github.com/mifi/editly/tree/master/examples

When you run with `--fast` or `fast: true` it will render a much quicker low resolution preview ⏩

By default without `--fast` it will use the **width**, **height** and **frame rate** from the **first** input video. **all other clips will be converted to these dimensions.** You can of course override any or all of these parameters.

**TIP:** Use this tool in conjunction with [LosslessCut](https://github.com/mifi/lossless-cut)

**TIP:** If you need catchy music for your video, have a look at [this YouTube](https://www.youtube.com/channel/UCht8qITGkBvXKsR1Byln-wA) or the [YouTube audio library](https://www.youtube.com/audiolibrary/music?nv=1). Then use [youtube-dl](https://github.com/ytdl-org/youtube-dl) to download the video, and then point `--audio-file-path` at the video file. *Be sure to respect their license!*

## Javascript library

```js
const editly = require('editly');

// See editSpec documentation
await editly(editSpec)
  .catch(console.error);
```

## Edit spec

Edit specs are Javascript / JSON ojects describing the whole edit operation with the following structure:

```js
{
  outPath,
  width,
  height,
  fps,
  defaults: {
    duration = 4,
    transition: {
      duration = 0.5,
      name = 'random',
    },
    layer: {
      fontPath,
      // ...more layer defaults
    }
  },
  audioFilePath,
  clips: [
    {
      transition,
      duration,
      layers: [
        {
          type,
          // ...more layer specific options
        }
        // ...more layers
      ],
    }
    // ...more clips
  ],

  // Testing options:
  enableFfmpegLog = false,
  verbose = false,
  fast = false,
}
```

### Parameters

| Parameter | CLI equivalent | Description | Default | |
|-|-|-|-|-|
| `outPath` | `--out` | Out path (mp4, mkv), can also be a `.gif` | | |
| `width` | `--width` | Width which all media will be converted to | `640` | |
| `height` | `--height` | Height which all media will be converted to | auto based on `width` and aspect ratio of **first video** | |
| `fps` | `--fps` | FPS which all videos will be converted to | First video FPS or `25` | |
| `audioFilePath` | `--audio-file-path` | Set an audio track to the whole output video | | |
| `fast` | `--fast`, `-f` | Fast mode (low resolution and FPS, useful for getting a quick preview) | `false` | |
| `defaults.layer.fontPath` | `--font-path` | Set default font to a .ttf | System font | |
| `defaults.layer.*` | | Set any layer parameter that all layers will inherit | | |
| `defaults.duration` | | Set default clip duration for clips that don't have an own duration | `4` | sec |
| `defaults.transition` | | An object `{ name, duration }` describing the default transition. Set to **null** to disable transitions | | |
| `defaults.transition.duration` | `--transition-duration` | Default transition duration | `0.5` | sec |
| `defaults.transition.name` | `--transition-name` | Default transition type. See **Transition types** | `random` | |
| `clips[]` | | List of clip objects that will be concatenated in sequence | | |
| `clips[].duration` | | Clip duration. See `defaults.duration` | `defaults.duration` | |
| `clips[].transition` | | Specify transition at the **end** of this clip. See `defaults.transition` | `defaults.transition` | |
| `clips[].layers[]` | | List of layers within the current clip that will be overlaid in their natural order (last layer on top) | | |
| `clips[].layers[].type` | | Layer type, see below | | |

### Transition types

`transition.name` can be any of [gl-transitions](https://gl-transitions.com/gallery), or any of the following: `directional-left`, `directional-right`, `directional-up`, `directional-down` and `random`.

### Layer types

See [examples](https://github.com/mifi/editly/tree/master/examples) and [commonFeatures.json5](https://github.com/mifi/editly/blob/master/examples/commonFeatures.json5)

#### Layer type 'video'

For video layers, if parent `clip.duration` is specified, the video will be slowed/sped-up to match `clip.duration`. If `cutFrom`/`cutTo` is set, the resulting segment (`cutTo`-`cutFrom`) will be slowed/sped-up to fit `clip.duration`.

| Parameter  | Description | Default | |
|-|-|-|-|
| `path` | Path to video file | | |
| `resizeMode` | One of `cover`, `contain`, `stretch` | `contain` | |
| `cutFrom` | Time value to cut from | `0` | sec |
| `cutTo` | Time value to cut from | *end of video* | sec |
| `backgroundColor` | Background of letterboxing | `#000000` | |

#### Layer type 'image'

| Parameter  | Description | Default | |
|-|-|-|-|
| `path` | Path to image file | | |
| `zoomDirection` | Zoom direction for Ken Burns effect: `in` or `out` | `in` | |
| `zoomAmount` | Zoom amount for Ken Burns effect | `0.1` | |

#### Layer type 'title'
- `fontPath` - See `defaults.layer.fontPath`
- `text` - Title text to show, keep it short
- `textColor` - default `#ffffff`
- `position` - Vertical position: `top`, `bottom` or `center`

#### Layer type 'subtitle'
- `fontPath` - See `defaults.layer.fontPath`
- `text` - Subtitle text to show
- `textColor` - default `#ffffff`

#### Layer type 'title-background'

Title with background

- `text` - See type `title`
- `textColor` - See type `title`
- `background` - `{ type, ... }` - See type `radial-gradient`, `linear-gradient` or `fill-color`
- `fontPath` - See type `title`

#### Layer type 'fill-color', 'pause'
- `color` - Color to fill background, default: randomize

#### Layer type 'radial-gradient'
- `colors` - Array of two colors, default: randomize

#### Layer type 'linear-gradient'
- `colors` - Array of two colors, default: randomize

#### Layer type 'rainbow-colors'

🌈🌈🌈

#### Layer type 'canvas'

See [customCanvas.js](https://github.com/mifi/editly/blob/master/examples/customCanvas.js)

- `func` - Custom Javascript function

#### Layer type 'fabric'

See [customFabric.js](https://github.com/mifi/editly/blob/master/examples/customFabric.js)

- `func` - Custom Javascript function

#### Layer type 'gl'

Loads a GLSL shader. See [gl.json5](https://github.com/mifi/editly/blob/master/examples/gl.json5) and [rainbow-colors.frag](https://github.com/mifi/editly/blob/master/shaders/rainbow-colors.frag)

- `fragmentPath`
- `vertexPath` (optional)

## Troubleshooting

- If you get `Error: The specified module could not be found.`, try: `npm un -g editly && npm i -g --build-from-source editly` (see [#15](https://github.com/mifi/editly/issues/15))

## See also

- https://github.com/transitive-bullshit/awesome-ffmpeg
- https://github.com/h2non/videoshow
- https://github.com/transitive-bullshit/ffmpeg-concat
- https://github.com/sjfricke/awesome-webgl
- https://www.mltframework.org/docs/melt/