import { Transform, TransformCallback, TransformOptions } from "stream";

export interface RawVideoToFramesOptions extends Omit<TransformOptions, "transform"> {
  width: number;
  height: number;
  channels: number;
}

/**
 * Transforms a raw video stream into individual frames.
 */
export function rawVideoToFrames({ width, height, channels, ...options }: RawVideoToFramesOptions) {
  const frameByteSize = width * height * channels;
  let buffer = new Uint8Array(frameByteSize);
  let bytesRead = 0;

  return new Transform({
    ...options,
    writableObjectMode: false,
    readableObjectMode: true,
    transform(chunk: Uint8Array, _: BufferEncoding, callback: TransformCallback) {
      let startAt = 0;

      // Find frames in chunk
      while (startAt < chunk.length) {
        const endAt = Math.min(startAt + frameByteSize - bytesRead, chunk.length);
        const bytesToRead = endAt - startAt;
        buffer.set(chunk.slice(startAt, endAt), bytesRead);
        bytesRead = (bytesRead + bytesToRead) % frameByteSize;

        if (bytesRead === 0) {
          // Emit frame
          this.push(buffer);

          // Reset data buffer
          buffer = new Uint8Array(frameByteSize);
        }

        // Move to next frame
        startAt = endAt;
      }

      callback();
    },
  });
}
