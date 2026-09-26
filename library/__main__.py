import argparse
import json

from .build import build
from .server import serve


def main():
    parser = argparse.ArgumentParser(description="ChessScope local chess game library")
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("build")
    create.add_argument("--corpus", default="data/corpus.sqlite")
    create.add_argument("--output", default="data/library.sqlite")
    create.add_argument("--fide-federations", default="data/raw/standard_sep26frl.zip")
    create.add_argument("--events", default="sources/verified-events.json")
    run = sub.add_parser("serve")
    run.add_argument("--corpus", default="data/corpus.sqlite")
    run.add_argument("--library", default="data/library.sqlite")
    run.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if args.command == "build":
        print(json.dumps(build(args.corpus, args.output, args.fide_federations, args.events), ensure_ascii=False, indent=2))
    else:
        serve(args.library, args.corpus, args.port)


if __name__ == "__main__":
    main()
