const pMap = require('p-map');
const { join, basename, resolve } = require('path');
const execa = require('execa');
const flatMap = require('lodash/flatMap');
const fs = require('fs-extra');

const { getFfmpegCommonArgs, getCutFromArgs } = require('./ffmpeg');
const { readFileStreams } = require('./util');

module.exports = ({ ffmpegPath, ffprobePath, enableFfmpegLog, verbose }) => {
  async function editAudio({ clips, tmpDir }) {
    if (clips.length === 0) return undefined;

    console.log('Extracting audio or creating silence from all clips');

    const mergedAudioPath = join(tmpDir, 'audio-merged.flac');

    const clipsOut = await pMap(clips, async (clip, i) => {
      const clipAudioPath = join(tmpDir, `clip${i}-audio.flac`);

      const { duration, layers, transition } = clip;

      const audioLayers = layers.filter(({ type, visibleFrom, visibleUntil }) => (
        ['audio', 'video'].includes(type)
        // TODO We don't support audio for visibleFrom/visibleUntil layers
        && !visibleFrom && visibleUntil == null));

      async function createSilence(outPath) {
        if (verbose) console.log('create silence', duration);
        const args = [
          '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
          '-sample_fmt', 's32',
          '-ar', '48000',
          '-t', duration,
          '-c:a', 'flac',
          '-y',
          outPath,
        ];
        await execa(ffmpegPath, args);
      }

      if (audioLayers.length > 0) {
        const processedAudioLayersRaw = await pMap(audioLayers, async (audioLayer, j) => {
          const { path, cutFrom, cutTo, speedFactor } = audioLayer;

          const streams = await readFileStreams(ffprobePath, path);
          if (!streams.some((s) => s.codec_type === 'audio')) return undefined;

          const layerAudioPath = join(tmpDir, `clip${i}-layer${j}-audio.flac`);

          try {
            let atempoFilter;
            if (Math.abs(speedFactor - 1) > 0.01) {
              if (verbose) console.log('audio speedFactor', speedFactor);
              const atempo = (1 / speedFactor);
              if (!(atempo >= 0.5 && atempo <= 100)) { // Required range by ffmpeg
                console.warn(`Audio speed ${atempo} is outside accepted range, using silence (clip ${i})`);
                return undefined;
              }
              atempoFilter = `atempo=${atempo}`;
            }

            const cutToArg = (cutTo - cutFrom) * speedFactor;

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

      return {
        path: resolve(clipAudioPath), // https://superuser.com/a/853262/658247
        transition,
      };
    }, { concurrency: 4 });

    if (clipsOut.length < 2) {
      await fs.rename(clipsOut[0].path, mergedAudioPath);
    } else {
      console.log('Combining audio', clipsOut.map(({ path }) => basename(path)));

      let inStream = '[0:a]';
      const filterGraph = clipsOut.slice(0, -1).map(({ transition }, i) => {
        const outStream = `[concat${i}]`;

        const epsilon = 0.0001; // If duration is 0, ffmpeg seems to default to 1 sec instead, hence epsilon.
        let ret = `${inStream}[${i + 1}:a]acrossfade=d=${Math.max(epsilon, transition.duration)}:c1=${transition.audioOutCurve || 'tri'}:c2=${transition.audioInCurve || 'tri'}`;

        inStream = outStream;

        if (i < clipsOut.length - 2) ret += outStream;
        return ret;
      }).join(',');

      const args = [
        ...getFfmpegCommonArgs({ enableFfmpegLog }),
        ...(flatMap(clipsOut, ({ path }) => ['-i', path])),
        '-filter_complex',
        filterGraph,
        '-c', 'flac',
        '-y',
        mergedAudioPath,
      ];
      await execa(ffmpegPath, args);
    }

    // TODO don't return audio if only silence?
    return mergedAudioPath;
  }

  return {
    editAudio,
  };
};
