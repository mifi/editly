import { renderSingleFrame } from "editly";
import fsExtra from "fs-extra";
import JSON from "json5";

await renderSingleFrame({
  time: 0,
  clips: JSON.parse(await fsExtra.readFile("./videos.json5", "utf-8")).clips,
  outPath: "renderSingleFrame.png",
});
