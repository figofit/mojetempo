#!/usr/bin/env python3
"""Expose smoke-test failures in the public GitHub job summary.

The inputs are test output with synthetic fixture data, not a process environment
or user diary. This helper never changes a test's exit code; the workflow keeps
and returns the original runner status after calling it.
"""

from __future__ import annotations

import argparse
from html import escape
import json
import os
from pathlib import Path
import sys


def code_block(text: str, limit: int = 16000) -> str:
    shortened = text if len(text) <= limit else "[earlier output truncated]\n" + text[-limit:]
    return "<pre>" + escape(shortened) + "</pre>\n"


def summarize(log: str, name: str, exit_code: int) -> str:
    records = []
    unstructured = []
    for line in log.splitlines():
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            unstructured.append(line)
            continue
        if isinstance(value, dict):
            records.append(value)

    checks = [record for record in records if isinstance(record.get("passed"), bool) and "name" in record]
    failed = [record for record in checks if not record["passed"]]
    passed = len(checks) - len(failed)
    result = "PASS" if exit_code == 0 and checks and not failed else "FAIL"
    output = [f"## {escape(name)}: {result}\n", f"Runner exit status: **{exit_code}**. Executed checks: **{len(checks)}**; passed: **{passed}**; failed: **{len(failed)}**.\n"]

    for record in records:
        if isinstance(record.get("runtime"), dict):
            output.append("### Browser runtime\n")
            output.append(code_block(json.dumps(record["runtime"], ensure_ascii=False, indent=2)))

    for record in failed:
        output.append(f"### Failed: {escape(str(record['name']))}\n")
        output.append(code_block(json.dumps(record.get("observed"), ensure_ascii=False, indent=2)))
        if record.get("traceback"):
            output.append("Traceback:\n")
            output.append(code_block(str(record["traceback"])))

    if exit_code and not failed:
        output.append("The runner exited before it reported a failed check.\n")
    if (exit_code or failed) and unstructured:
        output.append("### Runner output and traceback\n")
        output.append(code_block("\n".join(unstructured)))
    if not checks:
        output.append("**No completed checks were reported; this does not validate the application.**\n")
    return "\n".join(output)


def public_failure(log: str, name: str) -> str:
    """Short synthetic test diagnostic, visible without access to private job logs."""
    checks, unstructured = [], []
    for line in log.splitlines():
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            if line.strip():
                unstructured.append(line.strip())
            continue
        if isinstance(item, dict) and 'name' in item and isinstance(item.get('passed'), bool):
            checks.append(item)
    failed = [item for item in checks if not item['passed']]
    if failed:
        item = failed[0]
        detail = str(item['name']) + ': ' + json.dumps(item.get('observed'), ensure_ascii=False)
    else:
        detail = ('Last completed: ' + str(checks[-1]['name']) + '. ') if checks else 'No completed checks. '
        detail += ' '.join(unstructured[-12:])
    message = (name + ': ' + detail)[:1600]
    return '::error title=Moje tempo verification::' + message.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--log", type=Path, required=True)
    parser.add_argument("--name", default="Browser smoke")
    parser.add_argument("--exit-code", type=int, required=True)
    parser.add_argument("--output", type=Path, help="Append here instead of GITHUB_STEP_SUMMARY; print to stdout when neither is configured.")
    args = parser.parse_args()
    try:
        log = args.log.read_text(encoding="utf-8", errors="replace")
        summary = summarize(log, args.name, args.exit_code)
        if args.exit_code:
            print(public_failure(log, args.name), flush=True)
        target = args.output or (Path(os.environ["GITHUB_STEP_SUMMARY"]) if os.environ.get("GITHUB_STEP_SUMMARY") else None)
        if target is None:
            sys.stdout.write(summary)
        else:
            with target.open("a", encoding="utf-8") as destination:
                destination.write(summary)
        return 0
    except OSError as error:
        print(f"Could not write test summary: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
