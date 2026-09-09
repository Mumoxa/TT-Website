#!/usr/bin/env python3
"""Generate public/downloads/Talent-Tree-Terms-of-Business.pdf from terms.json.

Uses reportlab. Brand colours match DESIGN.md (ink / paper / accent).
Run from the repo root:

    /tmp/pdfvenv/bin/python scripts/build-terms-pdf.py
"""

from __future__ import annotations

import json
from pathlib import Path

from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
TERMS_PATH = ROOT / "src" / "downloads" / "terms.json"
LOGO_PATH = ROOT / "Talent Tree Logo 2026 (1).png"
OUT_PATH = ROOT / "public" / "downloads" / "Talent-Tree-Terms-of-Business.pdf"

INK = HexColor("#0e2a3a")
INK_DEEP = HexColor("#071f2d")
ACCENT = HexColor("#006da3")
MUTED = HexColor("#4f6b7a")
PAPER = HexColor("#f4f1ea")
LINE = Color(14 / 255, 42 / 255, 58 / 255, alpha=0.16)

PAGE_W, PAGE_H = A4
MARGIN_X = 22 * mm
MARGIN_TOP = 24 * mm
MARGIN_BOTTOM = 20 * mm
CONTENT_W = PAGE_W - (MARGIN_X * 2)


def wrap(text: str, font: str, size: float, width: float) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        trial = word if not current else f"{current} {word}"
        if pdfmetrics.stringWidth(trial, font, size) <= width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [""]


def draw_header_bar(c: canvas.Canvas, terms: dict, page: int) -> None:
    c.setFillColor(INK_DEEP)
    c.rect(0, PAGE_H - 16 * mm, PAGE_W, 16 * mm, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Times-Bold", 9)
    c.drawString(MARGIN_X, PAGE_H - 10 * mm, "TALENT TREE CONSULTING")
    c.setFont("Times-Italic", 9)
    c.drawRightString(PAGE_W - MARGIN_X, PAGE_H - 10 * mm, terms["title"])
    c.setFillColor(ACCENT)
    c.rect(0, PAGE_H - 16.6 * mm, PAGE_W, 1.2, fill=1, stroke=0)


def draw_footer(c: canvas.Canvas, terms: dict, page: int, total: int) -> None:
    c.setFillColor(LINE)
    c.rect(MARGIN_X, 14 * mm, CONTENT_W, 0.4, fill=1, stroke=0)
    c.setFillColor(MUTED)
    c.setFont("Times-Roman", 8)
    c.drawString(MARGIN_X, 9 * mm, f"Version {terms['version']}  ·  Effective {terms['effective']}")
    c.drawRightString(PAGE_W - MARGIN_X, 9 * mm, f"{page} / {total}")
    c.setFillColor(ACCENT)
    c.drawCentredString(PAGE_W / 2, 9 * mm, terms["email"])


class Pager:
    def __init__(self, c: canvas.Canvas, terms: dict):
        self.c = c
        self.terms = terms
        self.page = 1
        self.y = PAGE_H - MARGIN_TOP
        self.pages: list[int] = [1]
        draw_header_bar(c, terms, 1)

    def new_page(self) -> None:
        self.c.showPage()
        self.page += 1
        self.pages.append(self.page)
        draw_header_bar(self.c, self.terms, self.page)
        self.y = PAGE_H - MARGIN_TOP - 4 * mm

    def need(self, height: float) -> None:
        if self.y - height < MARGIN_BOTTOM + 8 * mm:
            self.new_page()

    def spacer(self, amount: float) -> None:
        self.y -= amount
        if self.y < MARGIN_BOTTOM + 8 * mm:
            self.new_page()

    def text(self, copy: str, font: str, size: float, leading: float, color, width: float | None = None) -> None:
        width = CONTENT_W if width is None else width
        lines = wrap(copy, font, size, width)
        self.need(leading * len(lines) + 2)
        self.c.setFillColor(color)
        self.c.setFont(font, size)
        for line in lines:
            self.c.drawString(MARGIN_X, self.y, line)
            self.y -= leading


def build() -> None:
    terms = json.loads(TERMS_PATH.read_text(encoding="utf-8"))
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    c = canvas.Canvas(str(OUT_PATH), pagesize=A4)
    c.setTitle(f"{terms['party']} — {terms['title']}")
    c.setAuthor(terms["party"])
    c.setSubject(terms["summary"])
    c.setCreator("Talent Tree website")

    pager = Pager(c, terms)

    # Cover block on page 1
    if LOGO_PATH.exists():
        pager.need(28 * mm)
        c.drawImage(
            str(LOGO_PATH),
            MARGIN_X,
            pager.y - 22 * mm,
            width=22 * mm,
            height=18 * mm,
            mask="auto",
            preserveAspectRatio=True,
            anchor="sw",
        )
        pager.y -= 26 * mm

    pager.text(terms["party"].upper(), "Times-Bold", 9, 12, ACCENT)
    pager.spacer(4)
    pager.text(terms["title"], "Times-Bold", 22, 26, INK)
    pager.text(
        f"Version {terms['version']}  ·  Effective {terms['effective']}  ·  South Africa",
        "Times-Italic",
        10,
        14,
        MUTED,
    )
    pager.spacer(6)
    c.setFillColor(ACCENT)
    c.rect(MARGIN_X, pager.y, 28 * mm, 1.4, fill=1, stroke=0)
    pager.spacer(14)

    pager.text(terms["summary"], "Times-Italic", 11, 16, INK)
    pager.spacer(10)

    for paragraph in terms["preamble"]:
        pager.text(paragraph, "Times-Roman", 10, 14, INK)
        pager.spacer(6)

    pager.spacer(8)

    for article in terms["articles"]:
        pager.need(28)
        pager.text(f"{article['number']}  {article['title']}", "Times-Bold", 12, 16, INK_DEEP)
        c.setFillColor(ACCENT)
        c.rect(MARGIN_X, pager.y + 4, 16 * mm, 0.8, fill=1, stroke=0)
        pager.spacer(8)
        for paragraph in article["paragraphs"]:
            pager.text(paragraph, "Times-Roman", 10, 14, INK)
            pager.spacer(5)
        pager.spacer(8)

    pager.spacer(6)
    pager.text(terms["closing"], "Times-Italic", 9, 12, MUTED)

    # Footers need the final page count; draw them by walking pages again is
    # awkward in reportlab, so stamp after save via a second pass.
    total = pager.page
    # Stamp the current (last) page footer, then we still miss earlier pages.
    # Instead: keep a form xobject approach — simpler to draw footer on each
    # page as we go, with a placeholder total, then rewrite. Easiest path:
    # we already know we'll only have a handful of pages; draw footer now
    # using a two-pass canvas is cleaner. Rebuild with known total.

    c.save()
    write_with_footers(terms, total)


def write_with_footers(terms: dict, expected_pages: int) -> None:
    """Second pass so every footer can show page N / total."""
    c = canvas.Canvas(str(OUT_PATH), pagesize=A4)
    c.setTitle(f"{terms['party']} — {terms['title']}")
    c.setAuthor(terms["party"])
    c.setSubject(terms["summary"])
    c.setCreator("Talent Tree website")

    class CountingPager(Pager):
        def new_page(self) -> None:
            draw_footer(self.c, self.terms, self.page, expected_pages)
            super().new_page()

    pager = CountingPager(c, terms)

    if LOGO_PATH.exists():
        pager.need(28 * mm)
        c.drawImage(
            str(LOGO_PATH),
            MARGIN_X,
            pager.y - 22 * mm,
            width=22 * mm,
            height=18 * mm,
            mask="auto",
            preserveAspectRatio=True,
            anchor="sw",
        )
        pager.y -= 26 * mm

    pager.text(terms["party"].upper(), "Times-Bold", 9, 12, ACCENT)
    pager.spacer(4)
    pager.text(terms["title"], "Times-Bold", 22, 26, INK)
    pager.text(
        f"Version {terms['version']}  ·  Effective {terms['effective']}  ·  South Africa",
        "Times-Italic",
        10,
        14,
        MUTED,
    )
    pager.spacer(6)
    c.setFillColor(ACCENT)
    c.rect(MARGIN_X, pager.y, 28 * mm, 1.4, fill=1, stroke=0)
    pager.spacer(14)

    pager.text(terms["summary"], "Times-Italic", 11, 16, INK)
    pager.spacer(10)

    for paragraph in terms["preamble"]:
        pager.text(paragraph, "Times-Roman", 10, 14, INK)
        pager.spacer(6)

    pager.spacer(8)

    for article in terms["articles"]:
        pager.need(28)
        pager.text(f"{article['number']}  {article['title']}", "Times-Bold", 12, 16, INK_DEEP)
        c.setFillColor(ACCENT)
        c.rect(MARGIN_X, pager.y + 4, 16 * mm, 0.8, fill=1, stroke=0)
        pager.spacer(8)
        for paragraph in article["paragraphs"]:
            pager.text(paragraph, "Times-Roman", 10, 14, INK)
            pager.spacer(5)
        pager.spacer(8)

    pager.spacer(6)
    pager.text(terms["closing"], "Times-Italic", 9, 12, MUTED)
    draw_footer(c, terms, pager.page, expected_pages)
    c.save()
    print(f"Wrote {OUT_PATH} ({pager.page} pages)")


if __name__ == "__main__":
    build()
