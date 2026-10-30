#!/usr/bin/env python3
"""Stage only the public Moje tempo application, without third-party packages."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile


APP_NAME = "moje-tempo"
BUILD_FORMAT = 1
MARKER = ".tempo-build.json"
PLACEHOLDER = "__TEMPO_VERSION__"
INTEGRITY_PLACEHOLDER = "/* __TEMPO_INTEGRITY__ */"
SOURCE_ROOT = Path(__file__).resolve().parent.parent
PUBLIC_FILES = (
    "index.html",
    "styles.css",
    "app.js",
    "domain.mjs",
    "storage.mjs",
    "local-storage.mjs",
    "sync-rules.mjs",
    "places.mjs",
    "planning.mjs",
    "habits.mjs",
    "invitation.mjs",
    "mobility-catalog.mjs",
    "schedule-rules.mjs",
    "vendor/leaflet/leaflet.js",
    "vendor/leaflet/leaflet.css",
    "vendor/leaflet/LICENSE",
    "pwa.mjs",
    "manifest.webmanifest",
    "service-worker.js",
    "icons/icon.svg",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/maskable-512.png",
)
OUTPUT_FILES = frozenset((*PUBLIC_FILES, ".nojekyll", MARKER))
OUTPUT_DIRS = frozenset({"icons", "vendor", "vendor/leaflet"})


def reject_symlink_path(path: Path) -> None:
    """Resolving a path must never hide a symlink into another directory."""
    for component in (path, *path.parents):
        if component.is_symlink():
            raise ValueError(f"Refusing symlink path: {component}")


def validate_output(path: Path) -> Path:
    absolute = Path(os.path.abspath(path.expanduser()))
    reject_symlink_path(absolute)
    output = absolute.resolve()
    if output == SOURCE_ROOT or output in SOURCE_ROOT.parents:
        raise ValueError("Refusing to overwrite the source checkout or one of its ancestors.")
    if output.is_relative_to(SOURCE_ROOT) and output != SOURCE_ROOT / "dist":
        raise ValueError("An output inside the source checkout must be its dist directory.")
    if not output.exists():
        return output
    if not output.is_dir():
        raise ValueError("The output path must be a directory.")
    if not any(output.iterdir()):
        return output

    marker = output / MARKER
    if marker.is_symlink() or not marker.is_file():
        raise ValueError("Refusing a non-empty output directory without a Moje tempo build marker.")
    try:
        metadata = json.loads(marker.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError("Refusing an output with an unreadable build marker.") from error
    if not isinstance(metadata, dict) or metadata.get("app") != APP_NAME or metadata.get("buildFormat") != BUILD_FORMAT:
        raise ValueError("Refusing an output not owned by this Moje tempo build format.")

    # Even a marked build may have acquired user files. Never erase or publish them.
    for current, directories, filenames in os.walk(output, followlinks=False):
        for name in (*directories, *filenames):
            item = Path(current) / name
            relative = item.relative_to(output).as_posix()
            if item.is_symlink():
                raise ValueError(f"Refusing a symlink in the output: {relative}")
            permitted = relative in (OUTPUT_DIRS if item.is_dir() else OUTPUT_FILES)
            if not permitted:
                raise ValueError(f"Refusing to overwrite an output containing an unrecognized file or directory: {relative}")
    return output


def source_assets() -> dict[str, bytes]:
    assets: dict[str, bytes] = {}
    for relative in PUBLIC_FILES:
        source = SOURCE_ROOT / relative
        reject_symlink_path(source)
        if not source.is_file():
            raise ValueError(f"Required public asset is missing: {relative}")
        assets[relative] = source.read_bytes()
    for relative in ("index.html", "service-worker.js"):
        if PLACEHOLDER.encode() not in assets[relative]:
            raise ValueError(f"The build version placeholder is missing from {relative}.")
    if INTEGRITY_PLACEHOLDER.encode() not in assets["service-worker.js"]:
        raise ValueError("The app-shell integrity placeholder is missing from service-worker.js.")
    return assets


def asset_version(assets: dict[str, bytes]) -> str:
    digest = hashlib.sha256()
    for relative, contents in sorted(assets.items()):
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(len(contents).to_bytes(8, "big"))
        digest.update(contents)
    return digest.hexdigest()


def build(output_path: Path) -> tuple[Path, str]:
    output = validate_output(output_path)
    # Read and validate every source before creating or modifying output files.
    assets = source_assets()
    version = asset_version(assets)
    for relative in ("index.html", "service-worker.js"):
        assets[relative] = assets[relative].replace(PLACEHOLDER.encode(), version.encode())
    # Hash the final stamped bytes, so a partly rolled out deployment cannot mix
    # one release's index with another release's modules inside the offline cache.
    integrity = {
        relative: "sha256-" + base64.b64encode(hashlib.sha256(contents).digest()).decode("ascii")
        for relative, contents in sorted(assets.items())
        if relative != "service-worker.js"
    }
    members = json.dumps(integrity, indent=2, sort_keys=True)[1:-1]
    assets["service-worker.js"] = assets["service-worker.js"].replace(
        INTEGRITY_PLACEHOLDER.encode(), members.encode("utf-8")
    )
    assets[".nojekyll"] = b""
    assets[MARKER] = (json.dumps({"app": APP_NAME, "buildFormat": BUILD_FORMAT, "version": version}, indent=2, sort_keys=True) + "\n").encode()

    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".tempo-stage-", dir=output.parent) as temporary:
        staging = Path(temporary)
        for relative, contents in assets.items():
            destination = staging / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(contents)
            destination.chmod(0o644)
        # Publish the marker last. No recursive deletion or wholesale checkout copy.
        output.mkdir(parents=True, exist_ok=True)
        for relative in (*PUBLIC_FILES, ".nojekyll", MARKER):
            destination = output / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            os.replace(staging / relative, destination)
    return output, version


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=SOURCE_ROOT / "dist", help="Empty output directory, or an existing build owned by this script.")
    args = parser.parse_args()
    try:
        output, version = build(args.output_dir)
    except (OSError, ValueError) as error:
        print(f"Build failed: {error}", file=sys.stderr)
        return 1
    print(f"Built {len(PUBLIC_FILES)} public assets in {output}")
    print(f"Version: {version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
