import { useEffect, useState } from "react";
import { requestAudioDuration } from "@/lib/media/audio-duration";

/**
 * How long an audio file plays, read when first needed and remembered for the session.
 *
 * Args:
 *   src: The item's `src` (project path on the desktop, blob URL in the browser); null = none.
 *   resolveSrc: Turns `src` into a URL the WebView can load.
 *   enabled: False to wait (e.g. until the card is near the screen).
 *
 * Returns:
 *   Seconds; null when it could not be read; undefined while reading or waiting.
 */
export function useAudioDuration(src: string | null, resolveSrc: (src: string) => string, enabled = true): number | null | undefined {
  const [read, setRead] = useState<{ readonly src: string; readonly seconds: number | null } | null>(null);
  useEffect(() => {
    if (!src || !enabled) return;
    let cancelled = false;
    void requestAudioDuration(src, resolveSrc(src)).then((seconds) => {
      if (!cancelled) setRead({ src, seconds });
    });
    return () => {
      cancelled = true;
    };
  }, [src, resolveSrc, enabled]);
  return src && read?.src === src ? read.seconds : undefined;
}
