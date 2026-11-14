"""Command-line interface for NISAR processing pipeline."""

import argparse
import logging
import sys
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from nisar.catalog import (
    discover_stacks,
    format_stack_table,
    save_stacks_json,
)
from nisar.site_builder import SiteBuildError, build_site, verify_site

logger = logging.getLogger(__name__)


def setup_logging(verbose: bool = False) -> None:
    """Configure logging."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )


def parse_bbox(bbox_str: str) -> list[float]:
    """Parse bbox string into [min_lon, min_lat, max_lon, max_lat]."""
    parts = bbox_str.split(",")
    if len(parts) != 4:
        raise ValueError("bbox must have 4 values: min_lon,min_lat,max_lon,max_lat")
    return [float(p.strip()) for p in parts]


def cmd_discover(args: argparse.Namespace) -> int:
    """Discover NISAR GCOV stacks for a given bbox and date range."""
    try:
        bbox = parse_bbox(args.bbox)
        
        print("Searching for NISAR GCOV granules...")
        print(f"  Bbox: {bbox}")
        print(f"  Date range: {args.start} to {args.end}")
        print(f"  Maturity: {args.maturity}")
        print(f"  Max results: {args.max_results}")
        
        stacks = discover_stacks(
            bbox=bbox,
            start=args.start,
            end=args.end,
            maturity=args.maturity,
            max_results=args.max_results,
            allow_high_latitude=args.allow_high_latitude,
        )
        
        print(f"\nFound {len(stacks)} stack(s):\n")
        print(format_stack_table(stacks))
        
        if args.json:
            save_stacks_json(stacks, args.json)
            print(f"\nSaved to {args.json}")
        
        return 0
        
    except (OSError, RuntimeError, ValueError) as e:
        logger.error(f"Error in discover: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        return 1


def cmd_build_site(args: argparse.Namespace) -> int:
    """Build a site from NISAR data."""
    try:
        result = build_site(
            Path(args.config),
            local_dir=Path(args.local_dir) if args.local_dir else None,
            max_acquisitions=args.max_acquisitions,
            dry_run=args.dry_run,
        )
        if args.dry_run:
            import json

            print(json.dumps(result, indent=2))
        else:
            print(f"Built NISAR site products at {result}")
        return 0
    except (SiteBuildError, OSError, ValueError) as exc:
        logger.error("Site build failed: %s", exc)
        return 1


def cmd_verify(args: argparse.Namespace) -> int:
    """Verify a built site."""
    try:
        for message in verify_site(args.site):
            print(message)
        return 0
    except (SiteBuildError, OSError, ValueError) as exc:
        logger.error("Site verification failed: %s", exc)
        return 1


def cmd_live_smoke(args: argparse.Namespace) -> int:
    """Run live smoke test to verify NISAR assumptions."""
    from scripts.live_smoke_nisar import BACKEND_DIR, run
    from scripts.live_smoke_nisar import parse_bbox as parse_smoke_bbox

    try:
        output = run(argparse.Namespace(
            bbox=parse_smoke_bbox(args.bbox or "-108,-76,-100,-74.5"),
            start=args.start or "2026-06-17",
            end=args.end or date.today().isoformat(),
            maturity=args.maturity,
            max_results=args.max_results,
            output=Path(BACKEND_DIR) / "docs" / "nisar_file_layout.md",
        ))
        print(f"Live smoke report written to {output}")
        return 0
    except (OSError, RuntimeError, ValueError) as exc:
        logger.error("Live smoke test failed: %s", exc)
        return 1


def main() -> None:
    """Main entry point for CLI."""
    parser = argparse.ArgumentParser(
        prog="python -m nisar.cli",
        description="NISAR processing pipeline CLI",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable verbose logging",
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # discover command
    discover_parser = subparsers.add_parser(
        "discover",
        help="Discover NISAR GCOV stacks",
    )
    discover_parser.add_argument(
        "--bbox",
        type=str,
        required=True,
        help="Bounding box as min_lon,min_lat,max_lon,max_lat",
    )
    discover_parser.add_argument(
        "--start",
        type=str,
        required=True,
        help="Start date in YYYY-MM-DD format",
    )
    discover_parser.add_argument(
        "--end",
        type=str,
        required=True,
        help="End date in YYYY-MM-DD format",
    )
    discover_parser.add_argument(
        "--maturity",
        type=str,
        default="PROVISIONAL",
        choices=["PROVISIONAL", "BETA"],
        help="Data maturity level",
    )
    discover_parser.add_argument(
        "--max-results",
        type=int,
        default=500,
        help="Maximum number of results to return",
    )
    discover_parser.add_argument(
        "--allow-high-latitude",
        action="store_true",
        help="Allow bboxes above 60° latitude",
    )
    discover_parser.add_argument(
        "--json",
        type=str,
        default=None,
        metavar="FILE",
        help="Save results to JSON file",
    )
    discover_parser.set_defaults(func=cmd_discover)
    
    # build-site command
    build_parser = subparsers.add_parser(
        "build-site",
        help="Build a site from NISAR data",
    )
    build_parser.add_argument(
        "--config",
        type=str,
        required=True,
        help="Path to site config YAML file",
    )
    build_parser.add_argument(
        "--max-acquisitions",
        type=int,
        default=None,
        help="Maximum number of acquisitions to process",
    )
    build_parser.add_argument(
        "--local-dir",
        type=str,
        default=None,
        help="Read pre-downloaded granules instead of downloading from ASF",
    )
    build_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print plan without executing",
    )
    build_parser.set_defaults(func=cmd_build_site)
    
    # verify command
    verify_parser = subparsers.add_parser(
        "verify",
        help="Verify a built site",
    )
    verify_parser.add_argument(
        "--site",
        type=str,
        required=True,
        help="Site ID to verify",
    )
    verify_parser.set_defaults(func=cmd_verify)
    
    # live-smoke command
    smoke_parser = subparsers.add_parser(
        "live-smoke",
        help="Run live smoke test",
    )
    smoke_parser.add_argument(
        "--bbox",
        type=str,
        help="Bounding box for smoke test",
    )
    smoke_parser.add_argument("--start", type=str, help="Start date (YYYY-MM-DD)")
    smoke_parser.add_argument("--end", type=str, help="End date (YYYY-MM-DD)")
    smoke_parser.add_argument("--maturity", choices=["PROVISIONAL", "BETA"], default="PROVISIONAL")
    smoke_parser.add_argument("--max-results", type=int, default=100)
    smoke_parser.set_defaults(func=cmd_live_smoke)
    
    # Parse arguments
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    setup_logging(args.verbose)
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
