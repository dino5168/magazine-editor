"""Patch a bundled font so the canvas, Typst (PDF) and every EPUB reading system see it the same way.

1. Line metrics: Windows engines (Chromium / WebView2, Thorium) place the baseline with the OS/2
   win metrics (or the typo metrics when USE_TYPO_METRICS is set); macOS engines use `hhea`. When
   they differ, an EPUB's text sits at different heights on the two platforms
   (`cargo test baseline_matches_css_line_box` checks this). The script copies the Windows numbers
   into `hhea`, the same numbers Noto Sans TC ships with.
2. Family names (only with `--style`): some fonts name every weight as its own family
   ("GenSenRounded2 TW R", "GenSenRounded2 TW B") and keep the shared name only in the typographic
   family (name ID 16). Typst groups faces by name ID 1, so it would never find a bold face. With
   `--style Regular|Bold`, name ID 1 becomes the typographic family and IDs 2 / 17 the style, in
   every language (`cargo test typst_sees_the_declared_family_and_weight` checks this).

Only `hhea` and `name` are rewritten (plus the file checksum in `head`); glyphs and every other
table are copied byte for byte. Both fonts patched this way are SIL OFL without a Reserved Font
Name covering their names, so the modified files may keep them.

Usage (needs `pip install fonttools`):
    python fonts/patch_font.py <original font> <output font> [--style Regular|Bold]
"""

import sys

from fontTools.ttLib import TTFont

FAMILY, SUBFAMILY, TYPOGRAPHIC_FAMILY, TYPOGRAPHIC_SUBFAMILY = 1, 2, 16, 17


def patch_font(source: str, target: str, style: str | None) -> None:
    # OS/2 從另一個實例讀取：在要存檔的實例上讀 OS/2 會讓 fontTools 連帶重新編譯 cmap
    os2 = TTFont(source, lazy=True)["OS/2"]
    if os2.fsSelection & (1 << 7):
        ascent, descent = os2.sTypoAscender, os2.sTypoDescender
    else:
        ascent, descent = os2.usWinAscent, -os2.usWinDescent
    # recalcBBoxes=False：不要重算 hhea 的其他欄位（會連帶解析並重新編譯字形表）
    font = TTFont(source, recalcBBoxes=False, recalcTimestamp=False)
    hhea = font["hhea"]
    print(f"{source}: hhea {hhea.ascent}/{hhea.descent}/{hhea.lineGap} -> {ascent}/{descent}/0")
    hhea.ascent, hhea.descent, hhea.lineGap = ascent, descent, 0

    if style is not None:
        name = font["name"]
        for record in list(name.names):
            if record.nameID != TYPOGRAPHIC_FAMILY:
                continue
            ids = (record.platformID, record.platEncID, record.langID)
            family = record.toUnicode()
            name.setName(family, FAMILY, *ids)
            name.setName(style, SUBFAMILY, *ids)
            name.setName(style, TYPOGRAPHIC_SUBFAMILY, *ids)
            print(f"  name {ids}: family {family!r}, style {style!r}")

    font.save(target)


if __name__ == "__main__":
    args = sys.argv[1:]
    style = None
    if len(args) == 4 and args[2] == "--style" and args[3] in ("Regular", "Bold"):
        style = args[3]
    elif len(args) != 2:
        sys.exit(__doc__)
    patch_font(args[0], args[1], style)
