import { execa } from "execa";
import { expect, test } from "vitest";
import { readDuration } from "../src/ffmpeg.js";

test(
  "works",
  async () => {
    await execa("npx", [
      "tsx",
      "src/cli.ts",
      "--allow-remote-requests",
      "title:'My video'",
      "https://raw.githubusercontent.com/mifi/editly-assets/main/overlay.svg",
      "title:'THE END'",
      "--fast",
      "--audio-file-path",
      "https://github.com/mifi/editly-assets/raw/main/winxp.mp3",
    ]);

    expect(await readDuration("editly-out.mp4")).toBe(11);
  },
  60 * 1000,
);
