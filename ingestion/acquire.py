"""Download immutable source snapshots, recording provenance and checksums."""
import concurrent.futures
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

BASE = "https://database.lichess.org/broadcast/"


def sha256(path):
    with open(path, "rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)


def download(url, path, expected=None):
    """Never expose a partially downloaded file as a completed source."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    metadata = path.with_suffix(path.suffix + ".source.json")
    if path.exists() and metadata.exists():
        old = json.loads(metadata.read_text())
        digest = sha256(path)
        if old["url"] == url and digest == old["sha256"] and (not expected or digest == expected):
            return old
    temporary = path.with_suffix(path.suffix + ".part")
    for attempt in range(3):
        try:
            request = Request(url, headers={"User-Agent": "ChessScope-ingestion/0.1 (research corpus)"})
            with urlopen(request, timeout=60) as response, temporary.open("wb") as out:
                size = 0
                digest = hashlib.sha256()
                while chunk := response.read(1024 * 1024):
                    out.write(chunk)
                    digest.update(chunk)
                    size += len(chunk)
                length = response.headers.get("Content-Length")
                if length and size != int(length):
                    raise ValueError(f"Truncated download: {url}")
                actual = digest.hexdigest()
                if expected and actual != expected:
                    raise ValueError(f"Checksum mismatch: {url}")
                result = {"url": url, "sha256": actual, "bytes": size,
                          "retrieved_at": datetime.now(timezone.utc).isoformat(),
                          "etag": response.headers.get("ETag"),
                          "last_modified": response.headers.get("Last-Modified")}
            temporary.replace(path)
            atomic_json(metadata, result)
            return result
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def fetch_broadcasts(directory, manifest, workers=3):
    directory = Path(directory)
    evidence = directory / "evidence"
    # Index snapshots are deliberately refreshed; the downloaded archives are cached.
    def index(name):
        with urlopen(BASE + name, timeout=60) as response:
            content = response.read().decode("utf-8")
        evidence.mkdir(parents=True, exist_ok=True)
        (evidence / name).write_text(content)
        return content
    urls = index("list.txt").splitlines()
    checksums = {line.split()[1].lstrip("*"): line.split()[0]
                 for line in index("sha256sums.txt").splitlines() if line.strip()}

    def one(url):
        if not re.fullmatch(re.escape(BASE) + r"lichess_db_broadcast_\d{4}-\d{2}\.pgn\.zst", url):
            raise ValueError(f"Unexpected URL in broadcast index: {url}")
        name = Path(urlparse(url).path).name
        path = directory / "raw" / name
        meta = download(url, path, checksums[name])
        entry = {"id": name.removesuffix(".pgn.zst"), "path": str(path.resolve()),
                 **meta, "license": "CC-BY-SA-4.0", "publisher": "Lichess",
                 "source_kind": "broadcast", "terms_url": "https://database.lichess.org/#broadcasts"}
        print(f"downloaded {name} {meta['bytes']} bytes", flush=True)
        return entry

    entries, failures = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        jobs = {pool.submit(one, url): url for url in urls}
        for job in concurrent.futures.as_completed(jobs):
            try:
                entries.append(job.result())
            except Exception as exc:
                failures.append({"url": jobs[job], "error": str(exc)})
            atomic_json(manifest, {"schema_version": 1, "expected_files": len(urls),
                                  "sources": sorted(entries, key=lambda x: x["id"]),
                                  "failures": failures, "complete": len(entries) == len(urls)})
    if failures:
        raise RuntimeError(f"{len(failures)} downloads failed; see {manifest}; rerun to retry")


def fetch_manifest(manifest_path):
    """Reproduce a pinned snapshot without refreshing the publisher's index."""
    payload = json.loads(Path(manifest_path).read_text())
    for source in payload["sources"]:
        if source.get("transformation", "none") != "none":
            raise ValueError("Transformed sources must use their source-specific acquisition adapter")
        download(source["url"], source["path"], source["sha256"])
        print(f"verified {source['id']}", flush=True)
