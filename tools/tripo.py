#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["tripo3d>=0.2.0"]
# ///
"""Tripo3D asset generation helper.

Usage:
  uv run tools/tripo.py balance
  uv run tools/tripo.py text "a low-poly rusty sword" [--out DIR] [--face-limit N] [--quad] [--no-texture]
  uv run tools/tripo.py image path/to/ref.png [--out DIR] [--face-limit N] [--quad]
  uv run tools/tripo.py status <task_id>
  uv run tools/tripo.py download <task_id> [--out DIR]

The API key is read from $TRIPO3D_API_KEY, falling back to the env block in
~/.claude/settings.json. Generation takes ~3-5 minutes; this script polls until
the task finishes and downloads the resulting GLB.
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

from tripo3d import TripoClient

# --- Cloudflare guard ----------------------------------------------------------
# api.tripo3d.ai sits behind Cloudflare, which serves a managed challenge
# ("Just a moment...", HTTP 403 HTML) to the SDK's hand-rolled raw-socket
# requests — they carry no User-Agent and their TLS/header shape does not look
# like a browser's, so every call died with
#   `HTTP 403: Failed to parse response as JSON. Response: <!DOCTYPE html>...`
# urllib with a browser User-Agent sails straight through, so swap the
# transport: keep the SDK's request-building and response-parsing contract
# (returns parsed JSON, raises TripoAPIError / TripoRequestError) and only
# replace the socket layer underneath it.
_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


def _install_urllib_transport() -> None:
    import shutil
    import urllib.error
    import urllib.parse
    import urllib.request

    from tripo3d.client_impl import ClientImpl
    from tripo3d.exceptions import TripoAPIError, TripoRequestError

    def _headers(extra=None):
        h = {"User-Agent": _UA, "Accept": "*/*"}
        h.update(extra or {})
        return h

    async def _request(self, method, path, params=None, json_data=None, data=None, headers=None):
        url = self._url(path)
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"
        hdrs = _headers(headers)
        hdrs["Authorization"] = f"Bearer {self.api_key}"
        body = data
        if json_data is not None:
            body = json.dumps(json_data).encode("utf-8")
            hdrs["Content-Type"] = "application/json"

        def fetch():
            req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
            try:
                with urllib.request.urlopen(req) as resp:
                    return resp.status, resp.read()
            except urllib.error.HTTPError as exc:
                return exc.code, exc.read()

        status, raw = await asyncio.to_thread(fetch)
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            raise TripoRequestError(
                status_code=status,
                message=f"Failed to parse response as JSON. Response: {raw.decode('utf-8', 'replace')[:200]}...",
            )
        if status >= 400:
            if "code" in payload and "message" in payload:
                raise TripoAPIError(
                    code=payload["code"],
                    message=payload["message"],
                    suggestion=payload.get("suggestion"),
                )
            raise TripoRequestError(status_code=status, message=f"Request failed: {payload}")
        return payload

    async def _download_file(self, url, output_path):
        def fetch():
            req = urllib.request.Request(url, headers=_headers())
            with urllib.request.urlopen(req) as resp, open(output_path, "wb") as fh:
                shutil.copyfileobj(resp, fh)

        await asyncio.to_thread(fetch)

    ClientImpl._request = _request
    ClientImpl.download_file = _download_file


_install_urllib_transport()

DEFAULT_OUT = "assets/generated"


def api_key() -> str:
    key = os.environ.get("TRIPO3D_API_KEY")
    if not key:
        settings = Path.home() / ".claude" / "settings.json"
        if settings.exists():
            key = json.loads(settings.read_text()).get("env", {}).get("TRIPO3D_API_KEY")
    if not key:
        sys.exit("TRIPO3D_API_KEY not found in environment or ~/.claude/settings.json")
    return key


async def finish(client: TripoClient, task_id: str, out_dir: str) -> None:
    print(f"task {task_id}: polling (typically 3-5 min)...")
    task = await client.wait_for_task(task_id, polling_interval=5.0, verbose=True)
    if str(task.status).lower().endswith("success"):
        Path(out_dir).mkdir(parents=True, exist_ok=True)
        files = await client.download_task_models(task, out_dir)
        for kind, path in files.items():
            print(f"downloaded {kind}: {path}")
    else:
        sys.exit(f"task ended with status {task.status}")


async def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("balance")

    t = sub.add_parser("text")
    t.add_argument("prompt")

    i = sub.add_parser("image")
    i.add_argument("path")

    s = sub.add_parser("status")
    s.add_argument("task_id")

    d = sub.add_parser("download")
    d.add_argument("task_id")

    for cmd in (t, i):
        cmd.add_argument("--face-limit", type=int, default=None)
        cmd.add_argument("--quad", action="store_true")
        cmd.add_argument("--no-texture", action="store_true")
    for cmd in (t, i, d):
        cmd.add_argument("--out", default=DEFAULT_OUT)

    args = p.parse_args()

    async with TripoClient(api_key=api_key()) as client:
        if args.cmd == "balance":
            balance = await client.get_balance()
            print(balance)
        elif args.cmd == "text":
            task_id = await client.text_to_model(
                prompt=args.prompt,
                face_limit=args.face_limit,
                quad=args.quad,
                texture=not args.no_texture,
            )
            await finish(client, task_id, args.out)
        elif args.cmd == "image":
            task_id = await client.image_to_model(
                image=args.path,
                face_limit=args.face_limit,
                quad=args.quad,
                texture=not args.no_texture,
            )
            await finish(client, task_id, args.out)
        elif args.cmd == "status":
            task = await client.get_task(args.task_id)
            print(f"status: {task.status}")
            if getattr(task, "output", None):
                print(task.output)
        elif args.cmd == "download":
            task = await client.get_task(args.task_id)
            await finish(client, args.task_id, args.out)


if __name__ == "__main__":
    asyncio.run(main())
