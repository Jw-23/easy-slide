import React from "react";
import { createRoot } from "react-dom/client";
import { SlideView } from "../../src/SlideView";
import { buildPptx, download } from "../../src/export";
import { exportFixture, exportFixtureAssets } from "../fixtures/pptx-export";
let root: ReturnType<typeof createRoot> | undefined;
export function showReference(index: number) {
  let host = document.getElementById("pptx-reference");
  if (!host) {
    host = document.createElement("div");
    host.id = "pptx-reference";
    Object.assign(host.style, {
      position: "fixed",
      left: "0",
      top: "0",
      width: "1280px",
      height: "720px",
      zIndex: "9999",
      background: "#fff",
    });
    document.body.append(host);
    root = createRoot(host);
  }
  root!.render(
    <SlideView
      deck={exportFixture}
      slide={exportFixture.slides[index]}
      index={index}
      assets={exportFixtureAssets}
    />,
  );
}
export async function exportReference(textMode: "faithful" | "editable") {
  download(
    await buildPptx(exportFixture, exportFixtureAssets, { textMode }),
    `${textMode}.pptx`,
  );
}
