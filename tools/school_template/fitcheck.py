"""Check that every text box of the template spec fits, measured with the app's own fonts (Geist).

Run from `tools/`:  uv run python -m school_template.fitcheck
"""

from __future__ import annotations

import math
from functools import cache
from pathlib import Path
from typing import Any

from PIL import ImageFont

from magazine.client import REPO_ROOT
from school_template import spec

FONTS_DIR = REPO_ROOT / "fonts"
# PIL 只接受整數字級：放大 20 倍量，再除回來
_SCALE = 20
REFERENCE_TITLE_BOX = [54, 50, 685, 95]  # master page title, {頁面名稱}


@cache
def _font(bold: bool, px: float) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS_DIR / f"Geist-{'Bold' if bold else 'Regular'}.ttf"), round(px * _SCALE))


def resolve_style(style: str | dict[str, Any]) -> dict[str, Any]:
    """Merges a spec style reference with its overrides.

    Args:
        style: A style name, or `{"style": name, ...overrides}`.

    Returns:
        The effective style (px, bold, lineHeight, letterSpacing ...).
    """
    options = {"style": style} if isinstance(style, str) else dict(style)
    name = options.pop("style")
    merged = dict(spec.BUILTIN_STYLE_UPDATES.get(name) or spec.NEW_STYLES[name])
    merged.update(options)
    return merged


def wrapped_lines(text: str, bold: bool, px: float, width_px: float, letter_spacing_px: float = 0) -> int:
    """Counts lines after word wrapping (like the canvas: break at spaces, keep `\\n`).

    Args:
        text: Text to wrap.
        bold: Bold font.
        px: Font size in px.
        width_px: Box width in px.
        letter_spacing_px: Extra space after each character.

    Returns:
        Number of lines.
    """
    font = _font(bold, px)
    count = 0
    for paragraph in text.split("\n"):
        line = ""
        for word in paragraph.split(" "):
            candidate = f"{line} {word}" if line else word
            if not line or font.getlength(candidate) / _SCALE + letter_spacing_px * len(candidate) <= width_px:
                line = candidate
            else:
                count += 1
                line = word
        count += 1
    return count


def overflow(style: str | dict[str, Any], box: list[float], text: str) -> str | None:
    """Explains why a text does not fit its reference box, or returns None when it fits.

    A box allows as many lines as its reference height holds at our line height (always at least one).
    """
    st = resolve_style(style)
    lines = wrapped_lines(text, st["bold"], st["px"], box[2], st.get("letterSpacing", 0) / 1000 * st["px"])
    allowed = max(1, math.ceil(box[3] / (st["px"] * st["lineHeight"]) - 0.25))
    return None if lines <= allowed else f"{lines} lines > {allowed}"


def check() -> list[str]:
    """Checks every text in the spec.

    Returns:
        One message per box that does not fit (empty when everything fits).
    """
    problems = []
    for number, page in enumerate(spec.PAGES, 1):
        for kind, style, box, text in page["items"]:
            if kind == "T" and (reason := overflow(style, box, text)):
                problems.append(f"p{number} [{','.join(map(str, box))}] {reason}: {text[:50]}")
    return problems


def title_lines(page_name: str) -> int:
    """Lines the master page title takes for this page name ({頁面名稱} in 標題 style)."""
    st = resolve_style("標題")
    return wrapped_lines(page_name, st["bold"], st["px"], REFERENCE_TITLE_BOX[2])


def main() -> None:
    """Prints title line counts and every overflow."""
    for number, page in enumerate(spec.PAGES, 1):
        if page["master"]:
            print(f"p{number} title {title_lines(page['name'])} line(s): {page['name']}")
    problems = check()
    print("\n".join(problems) if problems else "all text fits")


if __name__ == "__main__":
    main()
