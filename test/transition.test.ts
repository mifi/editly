import { describe, expect, test } from "vitest";
import { Transition } from "../src/transition.js";

describe("constructor", () => {
  test("null", () => {
    const transition = new Transition(null);
    expect(transition.duration).toBe(0);
  });

  test("random transition", () => {
    const transition = new Transition({ name: "random", duration: 1 });
    expect(transition.name).toBeDefined();
    expect(transition.name).not.toBe("random");
  });

  test("directional-left", () => {
    const transition = new Transition({ name: "directional-left" });
    expect(transition.name).toBe("directional");
    expect(transition.params).toEqual({ direction: [1, 0] });
  });

  test("raises error with unknown transition", () => {
    expect(() => new Transition({ name: "unknown", duration: 1 })).toThrow(
      "Transition not found: unknown",
    );
  });
});

describe("easingFunction", () => {
  test("linear", () => {
    const transition = new Transition({ name: "fade", easing: "linear" });
    expect(transition.easingFunction(0.5)).toBe(0.5);
  });

  test("easeOutExpo", () => {
    const transition = new Transition({ name: "fade", easing: "easeOutExpo" });
    expect(transition.easingFunction(0.2)).toBe(0.75);
  });

  test("easeInOutCubic", () => {
    const transition = new Transition({ name: "fade", easing: "easeInOutCubic" });
    expect(transition.easingFunction(0.2)).toBeCloseTo(0.032, 3);
    expect(transition.easingFunction(0.5)).toBe(0.5);
    expect(transition.easingFunction(0.8)).toBeCloseTo(0.968, 3);
  });
});
