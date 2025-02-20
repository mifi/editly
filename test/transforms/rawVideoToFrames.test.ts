import { expect, test } from "vitest";
import { rawVideoToFrames } from "../../src/transforms/rawVideoToFrames.js";

test("handles chunk of correct size", () => {
  const transform = rawVideoToFrames({ width: 2, height: 2, channels: 4 });
  const chunk = new Uint8Array(2 * 2 * 4).fill(128);

  transform.write(chunk);

  const frame: Uint8Array = transform.read();
  expect(frame).toBeInstanceOf(Uint8Array);
  expect(frame).toEqual(chunk);
});

test("partial frames", () => {
  const transform = rawVideoToFrames({ width: 2, height: 2, channels: 4 });

  // Write half the bytes
  transform.write(new Uint8Array(8).fill(128));

  expect(transform.read()).toBeNull();

  // Write rest of the frame and two extra bytes
  transform.write(new Uint8Array(10).fill(128));

  const frame: Uint8Array = transform.read();
  expect(frame).toEqual(new Uint8Array(16).fill(128));

  // Remaining bytes
  transform.write(new Uint8Array(14).fill(128));
  expect(transform.read()).toBeInstanceOf(Uint8Array);
});
