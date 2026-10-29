import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { attachKonvaMeasureCanvas } from "./lib/editor/konva-measure-canvas";
import "./index.css";

// 量字用的 canvas 要在任何量字之前放進 DOM，全形標點才和畫面一樣不擠（見 index.css 的 text-spacing-trim）
attachKonvaMeasureCanvas();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);