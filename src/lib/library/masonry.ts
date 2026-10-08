/** A card's shape for the layout: height ÷ width of its thumbnail, plus a fixed caption below. */
export interface MasonryCard {
  readonly aspect: number;
}

export interface MasonryOptions {
  /** Width available for the columns (px). */
  readonly width: number;
  /** Columns are at least this wide (px); the count is the most that fit. */
  readonly minColumnWidth: number;
  /** Gap between columns and between cards (px). */
  readonly gap: number;
  /** Fixed height under each thumbnail (px), e.g. the file name. */
  readonly captionHeight: number;
}

export interface MasonryBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  /** Thumbnail height; the card is `height + captionHeight` tall. */
  readonly height: number;
}

export interface MasonryLayout {
  readonly columns: number;
  readonly columnWidth: number;
  /** Same order as the input cards. */
  readonly boxes: readonly MasonryBox[];
  /** Total height (px). */
  readonly height: number;
}

/** Thumbnails taller than this (height ÷ width) are cropped, so one strip does not fill a column. */
export const MASONRY_MAX_ASPECT = 2.5;
/** …and flatter than this, so a panorama is not a thin line. */
export const MASONRY_MIN_ASPECT = 0.4;

/**
 * Lays out cards Eagle-style: each card goes into the currently shortest column, so the order runs
 * left to right (CSS `columns` would run top to bottom). Sizes are known from the library, so
 * nothing is measured.
 *
 * Args:
 *   cards: Cards in display order.
 *   options: Available width, column width, gap and caption height.
 *
 * Returns:
 *   Column count, column width, one box per card and the total height.
 */
export function masonryLayout(cards: readonly MasonryCard[], options: MasonryOptions): MasonryLayout {
  const { width, minColumnWidth, gap, captionHeight } = options;
  const columns = Math.max(1, Math.floor((width + gap) / (minColumnWidth + gap)));
  const columnWidth = Math.max(0, (width - gap * (columns - 1)) / columns);
  const bottoms = new Array<number>(columns).fill(0);
  const boxes = cards.map((card) => {
    const aspect = Number.isFinite(card.aspect) ? Math.min(MASONRY_MAX_ASPECT, Math.max(MASONRY_MIN_ASPECT, card.aspect)) : 1;
    // 最矮的一欄；同高時取最左邊
    const column = bottoms.indexOf(Math.min(...bottoms));
    const height = columnWidth * aspect;
    const box = { x: column * (columnWidth + gap), y: bottoms[column], width: columnWidth, height };
    bottoms[column] += height + captionHeight + gap;
    return box;
  });
  const height = cards.length === 0 ? 0 : Math.max(...bottoms) - gap;
  return { columns, columnWidth, boxes, height };
}
