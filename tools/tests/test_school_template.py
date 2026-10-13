"""The template spec stays consistent and its text fits (measured with the repo's Geist fonts)."""

from __future__ import annotations

import pytest

from school_template import build, fitcheck, spec

SWATCH_NAMES = {name for name, _ in spec.SWATCHES} | {"白"}  # 「白」 is a built-in document swatch
STYLE_NAMES = set(spec.BUILTIN_STYLE_UPDATES) | set(spec.NEW_STYLES)
PAGE_NAME_MAX_LENGTH = 50  # src/lib/editor/validation.ts


def all_items():
    yield from (("master", item) for item in spec.MASTER)
    for number, page in enumerate(spec.PAGES, 1):
        yield from ((f"p{number}", item) for item in page["items"])


def test_every_text_uses_a_defined_style() -> None:
    for where, (kind, style, _, text) in all_items():
        if kind == "T":
            name = style if isinstance(style, str) else style["style"]
            assert name in STYLE_NAMES, f"{where}: unknown style {name}"
            assert text, f"{where}: empty text"


def test_every_color_is_a_swatch() -> None:
    for name, style in {**spec.BUILTIN_STYLE_UPDATES, **spec.NEW_STYLES}.items():
        assert style["color"] in SWATCH_NAMES, f"style {name}"
    for where, (kind, options, _, _) in all_items():
        if kind == "LINE":
            assert options in SWATCH_NAMES, where
        elif kind in ("DOT", "BOX"):
            colors = [options] if isinstance(options, str) else [options.get("fill"), options.get("stroke")]
            assert all(c in SWATCH_NAMES for c in colors if c), where
        elif kind == "T" and isinstance(options, dict) and "color" in options:
            assert options["color"] in SWATCH_NAMES, where


def test_swatches_are_lowercase_hex_and_unique() -> None:
    names = [name for name, _ in spec.SWATCHES]
    assert len(names) == len(set(names))
    for _, color in spec.SWATCHES:
        assert len(color) == 7 and color == color.lower() and color.startswith("#")


def test_page_names_fit_the_app_limit() -> None:
    for page in spec.PAGES:
        assert 0 < len(page["name"]) <= PAGE_NAME_MAX_LENGTH


def test_boxes_are_on_the_page_and_shapes_meet_the_minimum() -> None:
    for where, (kind, _, box, _) in all_items():
        x, y, w, h = box
        assert 0 <= x and 0 <= y and x + w <= 794 and y + h <= 1124, where
        if kind in ("IMG", "DOT", "BOX"):  # LINE is widened to the minimum by the builder
            assert min(build.pt(w), build.pt(h)) >= build.MIN_SHAPE_PT, where


def test_contents_lists_one_entry_per_article_page() -> None:
    numbers = [text for kind, style, _, text in spec.PAGES[1]["items"] if style == "目錄編號"]
    assert numbers == [f"{n:02d}" for n in range(1, 10)]


def test_all_text_fits() -> None:
    assert fitcheck.check() == []


@pytest.mark.parametrize("number", [n for n, page in enumerate(spec.PAGES, 1) if page["master"]])
def test_master_title_wraps_like_the_reference(number: int) -> None:
    expected = spec.REFERENCE_TITLE_LINES.get(number, 1)
    assert fitcheck.title_lines(spec.PAGES[number - 1]["name"]) == expected


def test_wrapped_lines_breaks_at_spaces_and_newlines() -> None:
    assert fitcheck.wrapped_lines("one two", False, 18, 10_000) == 1
    assert fitcheck.wrapped_lines("one two", False, 18, 40) == 2
    assert fitcheck.wrapped_lines("one\ntwo", False, 18, 10_000) == 2
    # 比框還寬的單字自己一行，不會多算一行空白
    assert fitcheck.wrapped_lines("extraordinarily", True, 40, 10) == 1


def test_style_fields_converts_px_and_links_swatches() -> None:
    fields = build.style_fields({"px": 24, "bold": True, "color": "主題藍", "lineHeight": 1.1})
    assert fields == {"font": "黑體", "fontSize": 18.0, "textColor": {"swatch": "主題藍"}, "bold": True, "lineHeight": 1.1}
