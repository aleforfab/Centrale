"""Fill the source register from local PDF files.

The repository records the filenames of the application white papers but does
not redistribute them. The register therefore ships with `null` fingerprints,
page counts and publication years, which mean "not verified here" rather than
zero. This script computes those values from files you already have locally and
can update the JSON.

Usage (from `dancing-with-sars-backend`):

    python -m scripts.build_source_register --pdf-dir ~/papers
    python -m scripts.build_source_register --pdf-dir ~/papers --write

Nothing is downloaded, and no file is copied into the repository.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

DEFAULT_REGISTER = (
    Path(__file__).resolve().parents[2]
    / "dancing-with-the-sars-frontend"
    / "public"
    / "resources"
    / "source-register.json"
)


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_pdf_metadata(path: Path) -> tuple[int | None, int | None, str | None]:
    """Return (page_count, publication_year, note).

    pypdf is optional: without it the script still reports fingerprints and
    says plainly that page counts could not be read.
    """
    try:
        from pypdf import PdfReader  # type: ignore
    except ImportError:
        return None, None, "pypdf not installed; page count and year not read"

    try:
        reader = PdfReader(str(path))
        pages = len(reader.pages)
        year = None
        metadata = reader.metadata or {}
        raw_date = str(metadata.get("/CreationDate", "")) if metadata else ""
        match = re.search(r"(19|20)\d{2}", raw_date)
        if match:
            year = int(match.group(0))
        return pages, year, None
    except Exception as error:  # noqa: BLE001 - report and continue
        return None, None, f"could not read PDF metadata: {error}"


def collect(pdf_dir: Path) -> dict[str, dict]:
    records: dict[str, dict] = {}
    for path in sorted(pdf_dir.glob("*.pdf")):
        pages, year, note = read_pdf_metadata(path)
        records[path.name] = {
            "sha256": sha256_of(path),
            "page_count": pages,
            "publication_year": year,
            "note": note,
        }
    return records


def duplicate_groups(records: dict[str, dict]) -> list[list[str]]:
    by_hash: dict[str, list[str]] = defaultdict(list)
    for filename, record in records.items():
        by_hash[record["sha256"]].append(filename)
    return [sorted(names) for names in by_hash.values() if len(names) > 1]


def update_register(register: dict, records: dict[str, dict]) -> tuple[dict, list[str], list[str]]:
    updated = json.loads(json.dumps(register))  # cheap deep copy
    matched: list[str] = []
    missing: list[str] = []
    for paper in updated["papers"]:
        record = records.get(paper["filename"])
        if not record:
            missing.append(paper["filename"])
            continue
        paper["sha256"] = record["sha256"]
        paper["page_count"] = record["page_count"]
        paper["publication_year"] = record["publication_year"]
        paper["verification"] = (
            "sha256, page count and year computed locally"
            if record["page_count"] is not None
            else "sha256 computed locally; page count not read"
        )
        matched.append(paper["filename"])

    groups = duplicate_groups(records)
    updated["duplicates"] = [
        {
            "files": [name for name in group if name in records],
            "relation": "byte-identical (same SHA-256)",
            "verified_in_this_repository": False,
            "note": "Computed by scripts/build_source_register.py from local files; "
            "the PDFs themselves are not stored in this repository.",
        }
        for group in groups
    ]
    if not groups:
        updated["duplicates"] = []

    all_known = (
        all(paper["sha256"] and paper["page_count"] for paper in updated["papers"])
        and not missing
    )
    updated["record_status"] = "complete" if all_known else "metadata-partial"
    return updated, matched, missing


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fill the source register from local PDFs.")
    parser.add_argument("--pdf-dir", type=Path, required=True, help="Directory containing the PDFs")
    parser.add_argument("--register", type=Path, default=DEFAULT_REGISTER, help="Register JSON to read")
    parser.add_argument("--write", action="store_true", help="Write the updated register back to disk")
    args = parser.parse_args(argv)

    if not args.pdf_dir.is_dir():
        print(f"Not a directory: {args.pdf_dir}", file=sys.stderr)
        return 1
    if not args.register.is_file():
        print(f"Register not found: {args.register}", file=sys.stderr)
        return 1

    records = collect(args.pdf_dir)
    if not records:
        print(f"No PDF files found in {args.pdf_dir}", file=sys.stderr)
        return 1

    register = json.loads(args.register.read_text(encoding="utf-8"))
    updated, matched, missing = update_register(register, records)

    print(f"Scanned {len(records)} PDF file(s) in {args.pdf_dir}")
    for filename, record in records.items():
        pages = record["page_count"] if record["page_count"] is not None else "unknown"
        print(f"  {filename}: sha256={record['sha256'][:16]}… pages={pages}")
        if record["note"]:
            print(f"    note: {record['note']}")

    print()
    print(f"Matched {len(matched)} register entr(ies).")
    if missing:
        print("Register entries with no matching file:")
        for filename in missing:
            print(f"  {filename}")
    extra = sorted(set(records) - set(matched))
    if extra:
        print("Files not referenced by the register:")
        for filename in extra:
            print(f"  {filename}")

    groups = duplicate_groups(records)
    if groups:
        print("Byte-identical groups:")
        for group in groups:
            print(f"  {' == '.join(group)}")

    print()
    print(f"Record status after update: {updated['record_status']}")
    if args.write:
        args.register.write_text(json.dumps(updated, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {args.register}")
    else:
        print("Dry run. Re-run with --write to update the register.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
