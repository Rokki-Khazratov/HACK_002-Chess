import argparse
import json

from .acquire import fetch_broadcasts, fetch_manifest
from .fide import fetch_fide_event, import_ratings
from .qualify import export, qualify, report
from .store import ingest


def main():
    parser = argparse.ArgumentParser(description="ChessScope source-attributed OTB corpus pipeline")
    commands = parser.add_subparsers(dest="command", required=True)
    fetch = commands.add_parser("fetch-broadcasts")
    fetch.add_argument("--directory", default="data")
    fetch.add_argument("--manifest", default="data/broadcast-manifest.json")
    fetch.add_argument("--workers", type=int, default=3)
    pinned = commands.add_parser("fetch-manifest")
    pinned.add_argument("--manifest", required=True)
    fide = commands.add_parser("fetch-fide-event")
    fide.add_argument("--event-id", required=True)
    fide.add_argument("--directory", default="data")
    fide.add_argument("--manifest", default="data/fide-manifest.json")
    fide.add_argument("--events", default="sources/verified-events.json")
    parse = commands.add_parser("ingest")
    parse.add_argument("--manifest", required=True)
    parse.add_argument("--db", default="data/corpus.sqlite")
    parse.add_argument("--workers", type=int, default=4)
    ratings = commands.add_parser("import-ratings")
    ratings.add_argument("--db", default="data/corpus.sqlite")
    ratings.add_argument("--archive", required=True)
    ratings.add_argument("--month", required=True)
    ratings.add_argument("--source-url", required=True)
    classify = commands.add_parser("qualify")
    classify.add_argument("--db", default="data/corpus.sqlite")
    classify.add_argument("--events", required=True)
    classify.add_argument("--threshold", type=int, default=1800)
    classify.add_argument("--rating-scope", choices=["both", "either"], default="both")
    stats = commands.add_parser("report")
    stats.add_argument("--db", default="data/corpus.sqlite")
    stats.add_argument("--output", default="data/report.json")
    out = commands.add_parser("export")
    out.add_argument("--db", default="data/corpus.sqlite")
    out.add_argument("--output", default="data/accepted.pgn")
    args = parser.parse_args()
    if args.command == "fetch-broadcasts":
        fetch_broadcasts(args.directory, args.manifest, args.workers)
    elif args.command == "fetch-manifest":
        fetch_manifest(args.manifest)
    elif args.command == "fetch-fide-event":
        print(json.dumps(fetch_fide_event(args.event_id, args.directory, args.manifest, args.events), indent=2))
    elif args.command == "ingest":
        ingest(args.manifest, args.db, args.workers)
    elif args.command == "import-ratings":
        print(import_ratings(args.db, args.archive, args.month, args.source_url))
    elif args.command == "qualify":
        print(json.dumps(qualify(args.db, args.events, args.threshold, args.rating_scope)))
    elif args.command == "report":
        result = report(args.db, args.output)
        print(json.dumps({k: v for k, v in result.items() if k != "sources"}, indent=2))
    elif args.command == "export":
        print(f"Exported {export(args.db, args.output)} accepted unique games")


if __name__ == "__main__":
    main()
