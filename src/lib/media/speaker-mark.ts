/**
 * The speaker drawn for audio elements (v19), as numbers both the canvas and the exports use. The
 * mark is defined in a unit box (x and y in −1…1, centred on the mark's middle) and scaled by
 * `size` (half its height in pt). Rust `export/render.rs` draws the same numbers (step 5 of
 * `docs/16-Plans-Audio/02-Audio-素材-實作.md`): change both together.
 */

/** Speaker body: a small box and its cone, clockwise from the top left. */
export const SPEAKER_BODY: readonly (readonly [number, number])[] = [
  [-0.9, -0.3],
  [-0.45, -0.3],
  [0.05, -0.75],
  [0.05, 0.75],
  [-0.45, 0.3],
  [-0.9, 0.3],
];

/** Where the sound waves are centred (the cone's mouth). */
export const SPEAKER_WAVE_CENTER: readonly [number, number] = [0.05, 0];
/** Radii of the two waves (to the middle of their stroke). */
export const SPEAKER_WAVE_RADII: readonly number[] = [0.4, 0.75];
/** Stroke width of a wave. */
export const SPEAKER_WAVE_WIDTH = 0.14;
/** Each wave spans this many degrees, symmetric around the x axis (pointing right). */
export const SPEAKER_WAVE_ANGLE = 90;

/** Fill of the round button when the audio has no poster. */
export const AUDIO_BACKGROUND = "#4338ca";
/** Half height of the mark as a share of the button's shorter side (no poster). */
export const AUDIO_MARK_RATIO = 0.3;
/** With a poster: badge radius as a share of the shorter side, mark half height as a share of the radius. */
export const AUDIO_BADGE_RADIUS = 0.2;
export const AUDIO_BADGE_MARK_RATIO = 0.55;

/** A wave as a ring sector (Konva `Arc`): centre, radii and the start angle (degrees, clockwise). */
export interface SpeakerWave {
  readonly x: number;
  readonly y: number;
  readonly innerRadius: number;
  readonly outerRadius: number;
  readonly angle: number;
  readonly rotation: number;
}

/**
 * The speaker centred on (cx, cy).
 *
 * Args:
 *   cx: Centre x (pt, in the element's box).
 *   cy: Centre y.
 *   size: Half the mark's height (pt).
 *
 * Returns:
 *   The body as flat `[x0, y0, x1, y1, …]` points and the two waves.
 */
export function speakerMark(cx: number, cy: number, size: number): { readonly body: readonly number[]; readonly waves: readonly SpeakerWave[] } {
  const body = SPEAKER_BODY.flatMap(([x, y]) => [cx + x * size, cy + y * size]);
  const [wx, wy] = SPEAKER_WAVE_CENTER;
  const waves = SPEAKER_WAVE_RADII.map((radius) => ({
    x: cx + wx * size,
    y: cy + wy * size,
    innerRadius: (radius - SPEAKER_WAVE_WIDTH / 2) * size,
    outerRadius: (radius + SPEAKER_WAVE_WIDTH / 2) * size,
    angle: SPEAKER_WAVE_ANGLE,
    rotation: -SPEAKER_WAVE_ANGLE / 2,
  }));
  return { body, waves };
}
