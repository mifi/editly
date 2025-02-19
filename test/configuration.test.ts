import { describe, expect, test } from "vitest";
import { Configuration } from "../src/configuration.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BadData = any;

describe("Configuration", () => {
  const input = {
    outPath: "test.mp4",
    clips: [{ layers: [{ type: "title", text: "Hello World" }] }],
  };

  test("requires outPath", () => {
    expect(() => new Configuration({ ...input, outPath: undefined } as BadData)).toThrow(
      "Please provide an output path",
    );
  });

  test("requires clip with at least one layer", () => {
    expect(() => new Configuration({ ...input, clips: undefined } as BadData)).toThrow(
      "Please provide at least 1 clip",
    );
    expect(() => new Configuration({ ...input, clips: [] })).toThrow(
      "Please provide at least 1 clip",
    );
    expect(() => new Configuration({ ...input, clips: [{}] } as BadData)).toThrow(
      /clip.layers must be an array/,
    );
  });

  test("layers must have a type", () => {
    expect(
      () => new Configuration({ ...input, clips: [{ layers: { title: "Nope" } }] } as BadData),
    ).toThrow('All "layers" must have a type');
  });

  test("allows single layer for backward compatibility", () => {
    const config = new Configuration({
      ...input,
      clips: [{ layers: input.clips[0].layers[0] }],
    } as BadData);
    expect(config.clips[0].layers.length).toBe(1);
  });

  test("customOutputArgs must be an array", () => {
    expect(() => new Configuration({ ...input, customOutputArgs: "test" } as BadData)).toThrow(
      "customOutputArgs must be an array of arguments",
    );
    expect(
      new Configuration({ ...input, customOutputArgs: ["test"] } as BadData).customOutputArgs,
    ).toEqual(["test"]);
  });

  describe("defaults", () => {
    test("merges defaults on layers", () => {
      const config = new Configuration({
        ...input,
        clips: [
          { layers: [{ type: "title", text: "Clip with duration" }], duration: 3 },
          {
            layers: [{ type: "title", text: "Clip with transition" }],
            transition: { duration: 1, name: "random" },
          },
        ],
        defaults: {
          duration: 5,
          transition: {
            duration: 0.5,
            name: "fade",
            audioOutCurve: "qsin",
          },
        },
      });

      expect(config.clips[0].duration).toBe(3);
      expect(config.clips[0].transition!).toEqual({
        duration: 0.5,
        name: "fade",
        audioOutCurve: "qsin",
        audioInCurve: "tri",
      });

      expect(config.clips[1].transition).toEqual({
        duration: 1,
        name: "random",
        audioOutCurve: "qsin",
        audioInCurve: "tri",
      });
    });
  });
});
