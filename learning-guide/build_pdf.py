"""Build the course PDF from course.md.

Usage:

    pip install reportlab
    python learning-guide/build_pdf.py
    python learning-guide/build_pdf.py --output Dancing_with_the_SARs_Course.pdf

The Markdown source is the single source of truth. This script supports the
subset used by course.md: headings, paragraphs, bullet and numbered lists,
fenced code blocks, pipe tables, blockquotes and horizontal rules. Anything it
does not understand is printed as a paragraph rather than dropped silently.
"""

from __future__ import annotations

import argparse
import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

HERE = Path(__file__).resolve().parent
DEFAULT_SOURCE = HERE / "course.md"
DEFAULT_OUTPUT = HERE / "Dancing_with_the_SARs_Beginner_Course.pdf"

INLINE_CODE = re.compile(r"`([^`]+)`")
BOLD = re.compile(r"\*\*([^*]+)\*\*")
ITALIC = re.compile(r"(?<!\*)\*([^*]+)\*(?!\*)")


def styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "CourseTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=30,
            spaceAfter=6,
            textColor=colors.HexColor("#0f172a"),
        ),
        "subtitle": ParagraphStyle(
            "CourseSubtitle",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=11.5,
            leading=17,
            textColor=colors.HexColor("#475569"),
            spaceAfter=14,
        ),
        "h1": ParagraphStyle(
            "H1",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=21,
            spaceBefore=16,
            spaceAfter=7,
            textColor=colors.HexColor("#0f172a"),
        ),
        "h2": ParagraphStyle(
            "H2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=17,
            spaceBefore=12,
            spaceAfter=5,
            textColor=colors.HexColor("#1e3a8a"),
        ),
        "h3": ParagraphStyle(
            "H3",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=11.5,
            leading=15,
            spaceBefore=9,
            spaceAfter=4,
            textColor=colors.HexColor("#334155"),
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.8,
            leading=14.6,
            alignment=TA_LEFT,
            spaceAfter=5,
        ),
        "quote": ParagraphStyle(
            "Quote",
            parent=base["BodyText"],
            fontName="Helvetica-Oblique",
            fontSize=9.6,
            leading=14,
            leftIndent=10,
            textColor=colors.HexColor("#475569"),
            spaceAfter=6,
        ),
        "code": ParagraphStyle(
            "Code",
            parent=base["Code"],
            fontName="Courier",
            fontSize=8.3,
            leading=11.2,
            textColor=colors.HexColor("#0f172a"),
            backColor=colors.HexColor("#f1f5f9"),
            borderPadding=5,
            leftIndent=2,
            spaceAfter=6,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.8,
            leading=14.2,
        ),
        "cell": ParagraphStyle(
            "Cell",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.4,
            leading=11.6,
        ),
        "cellhead": ParagraphStyle(
            "CellHead",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8.4,
            leading=11.6,
            textColor=colors.white,
        ),
    }


def inline(text: str) -> str:
    """Escape HTML, then apply the inline Markdown used by the course."""
    escaped = html.escape(text.strip())
    escaped = INLINE_CODE.sub(lambda m: f'<font face="Courier" size="8.6">{m.group(1)}</font>', escaped)
    escaped = BOLD.sub(lambda m: f"<b>{m.group(1)}</b>", escaped)
    escaped = ITALIC.sub(lambda m: f"<i>{m.group(1)}</i>", escaped)
    return escaped


def parse_table(lines: list[str], style_map: dict[str, ParagraphStyle]) -> Table:
    rows: list[list[str]] = []
    for line in lines:
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if all(set(cell) <= set("-: ") and cell for cell in cells):
            continue  # separator row
        rows.append(cells)
    width = max(len(row) for row in rows)
    normalised = [row + [""] * (width - len(row)) for row in rows]
    data = []
    for index, row in enumerate(normalised):
        cell_style = style_map["cellhead"] if index == 0 else style_map["cell"]
        data.append([Paragraph(inline(cell), cell_style) for cell in row])
    table = Table(data, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5f5")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ]
        )
    )
    return table


def build_story(markdown: str) -> list:
    style_map = styles()
    story: list = []
    lines = markdown.splitlines()
    index = 0
    title_done = False

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()

        if not stripped:
            index += 1
            continue

        if stripped.startswith("```"):
            index += 1
            block: list[str] = []
            while index < len(lines) and not lines[index].strip().startswith("```"):
                block.append(lines[index])
                index += 1
            index += 1
            story.append(Preformatted("\n".join(block), style_map["code"]))
            continue

        if stripped.startswith("|") and stripped.endswith("|"):
            block = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                block.append(lines[index])
                index += 1
            story.append(parse_table(block, style_map))
            story.append(Spacer(1, 6))
            continue

        if re.fullmatch(r"-{3,}", stripped):
            story.append(PageBreak())
            index += 1
            continue

        heading = re.match(r"^(#{1,3})\s+(.*)$", stripped)
        if heading:
            level = len(heading.group(1))
            text = heading.group(2)
            if level == 1 and not title_done:
                story.append(Paragraph(inline(text), style_map["title"]))
                title_done = True
            elif level == 1:
                story.append(Paragraph(inline(text), style_map["h1"]))
            elif level == 2:
                story.append(Paragraph(inline(text), style_map["h2"]))
            else:
                story.append(Paragraph(inline(text), style_map["h3"]))
            index += 1
            continue

        if stripped.startswith(">"):
            story.append(Paragraph(inline(stripped.lstrip("> ")), style_map["quote"]))
            index += 1
            continue

        bullet_match = re.match(r"^([-*])\s+(.*)$", stripped)
        numbered_match = re.match(r"^(\d+)\.\s+(.*)$", stripped)
        if bullet_match or numbered_match:
            ordered = numbered_match is not None
            items: list[ListItem] = []
            while index < len(lines):
                candidate = lines[index].strip()
                match = re.match(r"^(\d+)\.\s+(.*)$", candidate) if ordered else re.match(
                    r"^[-*]\s+(.*)$", candidate
                )
                if not match:
                    break
                text = match.group(2) if ordered else match.group(1)
                items.append(ListItem(Paragraph(inline(text), style_map["bullet"]), leftIndent=14))
                index += 1
            story.append(
                ListFlowable(
                    items,
                    bulletType="1" if ordered else "bullet",
                    start=1 if ordered else None,
                    leftIndent=12,
                    bulletFontSize=9,
                    spaceAfter=6,
                )
            )
            continue

        paragraph: list[str] = []
        while index < len(lines):
            candidate = lines[index].strip()
            if (
                not candidate
                or candidate.startswith(("#", "|", ">", "```"))
                or re.match(r"^([-*]|\d+\.)\s+", candidate)
                or re.fullmatch(r"-{3,}", candidate)
            ):
                break
            paragraph.append(candidate)
            index += 1
        story.append(Paragraph(inline(" ".join(paragraph)), style_map["body"]))

    return story


def add_page_furniture(canvas, document) -> None:
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(colors.HexColor("#94a3b8"))
    canvas.drawString(18 * mm, 10 * mm, "Dancing with the SARs — beginner course")
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"page {document.page}")
    canvas.restoreState()


def build(source: Path, output: Path) -> int:
    markdown = source.read_text(encoding="utf-8")
    style_map = styles()
    story = build_story(markdown)
    story.insert(
        1,
        Paragraph(
            inline(
                "Radar remote sensing for beginners, with the limitations stated "
                "as carefully as the capabilities."
            ),
            style_map["subtitle"],
        ),
    )

    document = SimpleDocTemplate(
        str(output),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title="Dancing with the SARs — beginner course",
        author="Dancing with the SARs project",
    )
    document.build(story, onFirstPage=add_page_furniture, onLaterPages=add_page_furniture)
    return document.page


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build the course PDF from course.md")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args(argv)

    if not args.source.is_file():
        print(f"Markdown source not found: {args.source}")
        return 1

    pages = build(args.source, args.output)
    size_kb = args.output.stat().st_size / 1024
    print(f"Wrote {args.output} ({pages} pages, {size_kb:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
