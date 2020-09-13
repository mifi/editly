const pMap = require('p-map');
const { join, basename, resolve } = require('path');
const execa = require('execa');
const flatMap = require('lodash/flatMap');
const fs = require('fs-extra');

const { getFfmpegCommonArgs, getCutFromArgs, createConcatFile } = require('./ffmpeg');
const { readFileStreams } = require('./util');

module.exports = ({ ffmpegPath, ffprobePath, enableFfmpegLog, verbose }) => {
  async function editAudio({ clips, tmpDir }) {
    if (clips.length === 0) return undefined;

    console.log('Extracting audio or creating silence from all clips');

    const mergedAudioPath = join(tmpDir, 'audio-merged.flac');

    const segments = await pMap(clips, async (clip, i) => {
      const clipAudioPath = join(tmpDir, `clip${i}-audio.flac`);

      const audioLayers = clip.layers.filter(({ type, visibleFrom, visibleUntil }) => (
        ['audio', 'video'].includes(type)
        // TODO We don't support audio for visibleFrom/visibleUntil layers
        && !visibleFrom && visibleUntil == null));

      async function createSilence(outPath) {
        if (verbose) console.log('create silence', clip.duration);
        const args = [
          '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
          '-sample_fmt', 's32',
          '-ar', '48000',
          '-t', clip.duration,
          '-c:a', 'flac',
          '-y',
          outPath,
        ];
        await execa(ffmpegPath, args);
      }

      if (audioLayers.length > 0) {
        const processedAudioLayersRaw = await pMap(audioLayers, async (audioLayer, j) => {
          const { path, cutFrom, audioCutTo, framePtsFactor } = audioLayer;

          const streams = await readFileStreams(ffprobePath, path);
          if (!streams.some((s) => s.codec_type === 'audio')) return undefined;

          const layerAudioPath = join(tmpDir, `clip${i}-layer${j}-audio.flac`);

          try {
            let atempoFilter;
            if (Math.abs(framePtsFactor - 1) > 0.01) {
              if (verbose) console.log('audio framePtsFactor', framePtsFactor);
              const atempo = (1 / framePtsFactor);
              if (!(atempo >= 0.5 && atempo <= 100)) { // Required range by ffmpeg
                console.warn(`Audio speed ${atempo} is outside accepted range, using silence (clip ${i})`);
                return undefined;
              }
              atempoFilter = `atempo=${atempo}`;
            }

            const cutToArg = (audioCutTo - cutFrom) * framePtsFactor;

            const args = [
              ...getFfmpegCommonArgs({ enableFfmpegLog }),
              ...getCutFromArgs({ cutFrom }),
              '-i', path,
              '-t', cutToArg,
              '-sample_fmt', 's32',
              '-ar', '48000',
              '-map', 'a:0', '-c:a', 'flac',
              ...(atempoFilter ? ['-filter:a', atempoFilter] : []),
              '-y',
              layerAudioPath,
            ];

            // console.log(args);
            await execa(ffmpegPath, args);
          } catch (err) {
            if (verbose) console.error('Cannot extract audio from video', path, err);
            // Fall back to silence
            await createSilence(layerAudioPath);
          }

          return { layerAudioPath, audioLayer };
        }, { concurrency: 4 });

        const processedAudioLayers = processedAudioLayersRaw.filter((p) => p);

        if (processedAudioLayers.length > 1) {
          // Merge/mix all layer's audio

          const weights = processedAudioLayers.map(({ audioLayer }) => (audioLayer.mixVolume != null ? audioLayer.mixVolume : 1));
          const args = [
            ...getFfmpegCommonArgs({ enableFfmpegLog }),
            ...flatMap(processedAudioLayers, ({ layerAudioPath }) => ['-i', layerAudioPath]),
            '-filter_complex', `amix=inputs=${processedAudioLayers.length}:duration=longest:weights=${weights.join(' ')}`,
            '-c:a', 'flac',
            '-y',
            clipAudioPath,
          ];

          await execa(ffmpegPath, args);
        } else if (processedAudioLayers.length > 0) {
          await fs.rename(processedAudioLayers[0].layerAudioPath, clipAudioPath);
        } else {
          await createSilence(clipAudioPath);
        }
      } else {
        await createSilence(clipAudioPath);
      }

      // https://superuser.com/a/853262/658247
      return resolve(clipAudioPath);
    }, { concurrency: 4 });

    const concatFilePath = join(tmpDir, 'audio-segments.txt');

    console.log('Combining audio', segments.map((s) => basename(s)), concatFilePath);

    await createConcatFile(segments, concatFilePath);

    const args = [
      ...getFfmpegCommonArgs({ enableFfmpegLog }),
      '-f', 'concat', '-safe', '0',
      '-i', concatFilePath,
      '-c', 'flac',
      '-y',
      mergedAudioPath,
    ];
    await execa(ffmpegPath, args);

    // TODO don't return audio if only silence?
    return mergedAudioPath;
  }

  return {
    editAudio,
  };
};
