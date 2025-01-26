import { registerFont } from "canvas";
import type { CustomFabricFunctionArgs, CustomFabricFunctionCallbacks } from "editly";
import editly from "editly";

registerFont("./assets/Patua_One/PatuaOne-Regular.ttf", { family: "Patua One" });

function func({ width, height, fabric }: CustomFabricFunctionArgs): CustomFabricFunctionCallbacks {
  return {
    async onRender(progress, canvas) {
      canvas.backgroundColor = "hsl(33, 100%, 50%)";

      const text = new fabric.FabricText(`PROGRESS\n${Math.floor(progress * 100)}%`, {
        originX: "center",
        originY: "center",
        left: width / 2,
        top: (height / 2) * (1 + (progress * 0.1 - 0.05)),
        fontSize: 20,
        fontFamily: "Patua One",
        textAlign: "center",
        fill: "white",
      });

      canvas.add(text);
    },

    onClose() {
      // Cleanup if you initialized anything
    },
  };
}

await editly({
  // fast: true,
  outPath: "./customFabric.gif",
  // outPath: './customFabric.mp4',
  clips: [{ duration: 2, layers: [{ type: "fabric", func }] }],
});
