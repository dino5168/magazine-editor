import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from "react";

interface PanStart {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly left: number;
  readonly top: number;
}

// 空白鍵只在焦點不在任何控制項時當成「暫時手形」：輸入框要能打空白，按鈕要能用空白鍵觸發
function isPanKeyTarget(target: EventTarget | null): boolean {
  return target === document.body || target === document.documentElement || target === null;
}

/**
 * Pans the canvas by dragging: with the hand tool, while Space is held, or with the middle button.
 *
 * Panning only changes the scroll container's `scrollLeft` / `scrollTop`, so the existing scroll
 * handling (Layer offset, zoom anchors) keeps working. Nothing is dispatched.
 *
 * Args:
 *   scrollRef: The canvas scroll container.
 *   handTool: Whether the hand tool is active.
 *
 * Returns:
 *   cursor: CSS cursor for the container (undefined = default).
 *   handlers: Props to spread on the scroll container.
 */
export function useCanvasPan(scrollRef: RefObject<HTMLDivElement | null>, handTool: boolean) {
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const startRef = useRef<PanStart | null>(null);
  const spaceRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== "Space" || !isPanKeyTarget(event.target)) return;
      // 阻止頁面捲動；按住不放的重複 keydown 也要攔
      event.preventDefault();
      if (!spaceRef.current) {
        spaceRef.current = true;
        setSpaceHeld(true);
      }
    };
    const release = (): void => {
      spaceRef.current = false;
      setSpaceHeld(false);
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === "Space") release();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    // 按著空白鍵切到別的視窗時收不到 keyup
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", release);
    };
  }, []);

  const end = (): void => {
    startRef.current = null;
    setPanning(false);
  };

  const handlers = {
    // capture 階段攔下：事件不會到達 Konva，物件不會被選取或拖曳；
    // preventDefault 讓瀏覽器也不送出後續的相容 mousedown（Konva 也聽 mousedown）
    onPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => {
      const pan = event.button === 1 || (event.button === 0 && (handTool || spaceRef.current));
      const element = scrollRef.current;
      if (!pan || !element) return;
      event.preventDefault();
      event.stopPropagation();
      element.setPointerCapture(event.pointerId);
      startRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: element.scrollLeft,
        top: element.scrollTop,
      };
      setPanning(true);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      const start = startRef.current;
      const element = scrollRef.current;
      if (!start || !element || event.pointerId !== start.pointerId) return;
      // 捲動後由容器的 onScroll 更新畫布位移，和一般捲動走同一條路
      element.scrollLeft = start.left - (event.clientX - start.x);
      element.scrollTop = start.top - (event.clientY - start.y);
    },
    onPointerUp: end,
    onLostPointerCapture: end,
    // Windows 的中鍵預設是自動捲動模式
    onMouseDownCapture: (event: MouseEvent<HTMLDivElement>) => {
      if (event.button === 1) event.preventDefault();
    },
  };

  const cursor = panning ? "grabbing" : handTool || spaceHeld ? "grab" : undefined;
  return { cursor, handlers };
}
