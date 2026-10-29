import Konva from "konva";
import { DEFAULT_FONT_FAMILY } from "./element-factory";

/** Text the self-check measures: two full-width punctuation marks Chromium squeezes when they touch. */
const PUNCTUATION_PAIR = "：「";
const CHECK_FONT_SIZE = 100;

/**
 * Puts the canvas Konva measures text with into the document, so it no longer squeezes full-width
 * punctuation. Call once at start-up, before anything measures text.
 *
 * Chromium's canvas squeezes adjacent full-width punctuation (the font's `halt`) unless the canvas
 * element's computed `text-spacing-trim` is `space-all` (set on `html` in `index.css`), and only a
 * canvas in the document has a computed style. The canvases Konva draws on are in the document;
 * the one it measures with (`measureTextLayout`, `node.measureSize`) is created by
 * `Konva.Util.createCanvasElement` on the first measurement and is not. Depends on Konva 10.5.0
 * internals (one shared measuring canvas made by `createCanvasElement`): re-check when upgrading.
 *
 * Returns:
 *   Nothing; logs a warning when the measuring canvas still squeezes (once the default font loads).
 */
export function attachKonvaMeasureCanvas(): void {
  if (typeof document === "undefined") return;
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position: fixed; left: 0; top: 0; width: 0; height: 0; overflow: hidden; visibility: hidden; pointer-events: none;";
  document.body.appendChild(host);

  // 只在觸發第一次量字的這一刻包住 createCanvasElement：建立的就是 Konva 共用的量字 canvas
  const create = Konva.Util.createCanvasElement;
  Konva.Util.createCanvasElement = () => {
    const canvas = create.call(Konva.Util);
    host.appendChild(canvas);
    return canvas;
  };
  const probe = new Konva.Text({ text: PUNCTUATION_PAIR, fontSize: CHECK_FONT_SIZE, fontFamily: DEFAULT_FONT_FAMILY });
  try {
    probe.measureSize(PUNCTUATION_PAIR);
  } finally {
    Konva.Util.createCanvasElement = create;
    probe.destroy();
  }
  if (host.childElementCount === 0) {
    console.warn("[text] Konva 的量字 canvas 已經先建立，全形標點的寬度可能和畫面、匯出不同");
  }

  // 預設字型載入後再檢查一次：兩個標點應該是兩個字寬（字型還沒載入時，替代字型可能沒有 halt，量不出差別）
  void document.fonts.load(`${CHECK_FONT_SIZE}px ${DEFAULT_FONT_FAMILY}`, PUNCTUATION_PAIR).then(() => {
    const node = new Konva.Text({ fontSize: CHECK_FONT_SIZE, fontFamily: DEFAULT_FONT_FAMILY });
    try {
      const pair = node.measureSize(PUNCTUATION_PAIR).width;
      const single = node.measureSize(PUNCTUATION_PAIR[0]).width + node.measureSize(PUNCTUATION_PAIR[1]).width;
      if (pair < single - 0.5) console.warn(`[text] 量字的 canvas 擠壓了全形標點（${pair} < ${single}）`);
    } finally {
      node.destroy();
    }
  });
}
