"""Loopback-only TSN voiceover recorder and local audio mastering service."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


HERE = Path(__file__).resolve().parent
DEMO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FLOW = DEMO_ROOT / "flows" / "tin-creation-wallet-recovery.json"
MAX_UPLOAD = 150 * 1024 * 1024


def find_ffmpeg() -> str | None:
    path = shutil.which("ffmpeg")
    if path:
        return path
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return None


def script_rows(path: Path) -> list[dict]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) != 3 or not re.match(r"\d{2}:\d{2}s*[–-]s*\d{2}:\d{2}", cells[0]):
            continue
        start, end = re.split(r"\s*[–-]\s*", cells[0])
        to_seconds = lambda value: int(value[:2]) * 60 + int(value[3:5])
        rows.append({"time": cells[0], "start": to_seconds(start), "end": to_seconds(end),
                     "text": cells[2].strip().strip("“”\"")})
    return rows


def run_ffmpeg(args: list[str]) -> None:
    result = subprocess.run(args, capture_output=True, text=True, timeout=300)
    if result.returncode:
        raise RuntimeError((result.stderr or "FFmpeg returned an error")[-3000:])


class StudioHandler(SimpleHTTPRequestHandler):
    server_version = "TSNVoiceoverStudio/1.0"

    def __init__(self, *args, directory: str | None = None, **kwargs):
        super().__init__(*args, directory=str(HERE), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        print(f"[voiceover-studio] {self.address_string()} {fmt % args}")

    def send_json(self, status: int, value: dict) -> None:
        data = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/config":
            flow = self.server.flow
            video = (self.server.flow_file.parent / flow["output"]).resolve()
            script = (self.server.flow_file.parent / flow.get("voiceoverScript", "")).resolve()
            if not video.is_file():
                self.send_json(500, {"error": "Flow video is missing. Render the demo first."})
                return
            self.send_json(200, {"title": flow.get("title", flow["flowId"]), "flowId": flow["flowId"],
                                 "videoUrl": "/api/demo-video",
                                 "finalVideoUrl": "/api/final-video",
                                 "finalVideoExists": self.server.final_voiceover.is_file(),
                                 "finalFileName": self.server.final_voiceover.name,
                                 "savedPath": f"tsn-demo/{self.server.final_voiceover.relative_to(DEMO_ROOT).as_posix()}",
                                 "script": script_rows(script) if script.is_file() else []})
            return
        if parsed.path == "/api/demo-video":
            self.serve_file(self.server.flow_file.parent / self.server.flow["output"])
            return
        if parsed.path == "/api/final-video":
            self.serve_file(self.server.final_voiceover)
            return
        if parsed.path.startswith("/api/takes/"):
            name = Path(parsed.path).name
            if not re.fullmatch(r"[0-9a-f-]{36}-(?:voice\.wav|mix\.mp4|raw\.webm)", name):
                self.send_json(404, {"error": "Unknown take file."})
                return
            self.serve_file(self.server.takes_dir / name)
            return
        return super().do_GET()

    def serve_file(self, path: Path) -> None:
        resolved = path.resolve()
        if not resolved.is_file():
            self.send_json(404, {"error": "Media file not found. Render the demo flow first."})
            return
        content_type = "video/mp4" if resolved.suffix.lower() == ".mp4" else "audio/wav" if resolved.suffix.lower() == ".wav" else "video/webm"
        size = resolved.stat().st_size
        range_header = self.headers.get("Range")
        start, end = 0, size - 1
        if range_header:
            match = re.match(r"bytes=(\d*)-(\d*)", range_header)
            if match:
                if match.group(1):
                    start = int(match.group(1))
                if match.group(2):
                    end = min(end, int(match.group(2)))
        if start > end or start >= size:
            self.send_response(416)
            self.end_headers()
            return
        self.send_response(206 if range_header else 200)
        self.send_header("Content-Type", content_type)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Cache-Control", "no-store")
        if range_header:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        with resolved.open("rb") as stream:
            stream.seek(start)
            remaining = end - start + 1
            while remaining:
                block = stream.read(min(1024 * 1024, remaining))
                if not block:
                    break
                self.wfile.write(block)
                remaining -= len(block)

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/process":
            self.send_json(404, {"error": "Unknown endpoint."})
            return
        port = self.server.server_port
        local_origins = (f"http://127.0.0.1:{port}", f"http://localhost:{port}")
        if self.headers.get("Origin") and self.headers["Origin"] not in local_origins:
            self.send_json(403, {"error": "Only the local studio origin is accepted."})
            return
        length = int(self.headers.get("Content-Length", "0"))
        if not length or length > MAX_UPLOAD:
            self.send_json(413, {"error": "Recording is empty or exceeds the 150 MB upload limit."})
            return
        ffmpeg = find_ffmpeg()
        if not ffmpeg:
            self.send_json(503, {"error": "FFmpeg was not found. Install the renderer requirements or add ffmpeg to PATH."})
            return
        cleanup = parse_qs(urlparse(self.path).query).get("cleanup", ["gentle"])[0]
        denoise = "12" if cleanup == "gentle" else "24"
        take_id = str(uuid.uuid4())
        self.server.takes_dir.mkdir(parents=True, exist_ok=True)
        raw = self.server.takes_dir / f"{take_id}-raw.webm"
        voice = self.server.takes_dir / f"{take_id}-voice.wav"
        mix = self.server.takes_dir / f"{take_id}-mix.mp4"
        try:
            remaining = length
            with raw.open("wb") as out:
                while remaining:
                    block = self.rfile.read(min(1024 * 1024, remaining))
                    if not block:
                        raise RuntimeError("Connection ended while receiving the take.")
                    out.write(block)
                    remaining -= len(block)
            voice_filter = (f"highpass=f=75,afftdn=nr={denoise}:nt=w:tn=1,lowpass=f=14500,"
                            "acompressor=threshold=-22dB:ratio=2.5:attack=8:release=150:makeup=2,"
                            "loudnorm=I=-18:TP=-2:LRA=11")
            run_ffmpeg([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw),
                        "-vn", "-af", voice_filter, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s24le", str(voice)])
            video = (self.server.flow_file.parent / self.server.flow["output"]).resolve()
            mix_filter = ("[1:a]apad=pad_dur=60,asplit=2[voice][key];"
                          "[0:a][key]sidechaincompress=threshold=0.035:ratio=7:attack=25:release=280[ducked];"
                          "[ducked][voice]amix=inputs=2:duration=first:weights='0.9 1':normalize=0,"
                          "alimiter=limit=0.95,loudnorm=I=-16:TP=-1.2:LRA=10[mix]")
            run_ffmpeg([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(video), "-i", str(voice),
                        "-filter_complex", mix_filter, "-map", "0:v:0", "-map", "[mix]", "-c:v", "copy",
                        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", str(mix)])
            final_output = self.server.final_voiceover
            final_output.parent.mkdir(parents=True, exist_ok=True)
            pending_output = final_output.with_name(f".{final_output.stem}.{take_id}.tmp{final_output.suffix}")
            shutil.copy2(mix, pending_output)
            os.replace(pending_output, final_output)
            relative_output = final_output.relative_to(DEMO_ROOT).as_posix()
            self.send_json(200, {"voiceUrl": f"/api/takes/{take_id}-voice.wav",
                                 "takeMixUrl": f"/api/takes/{take_id}-mix.mp4",
                                 "mixUrl": "/api/final-video",
                                 "finalFileName": final_output.name,
                                 "savedPath": f"tsn-demo/{relative_output}",
                                 "voiceBytes": voice.stat().st_size, "mixBytes": final_output.stat().st_size})
        except (OSError, RuntimeError, subprocess.SubprocessError) as exc:
            self.send_json(500, {"error": str(exc)[:3500]})


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the local TSN XP voiceover recording studio.")
    parser.add_argument("--flow", type=Path, default=DEFAULT_FLOW, help="Demo flow JSON to record narration for.")
    parser.add_argument("--port", type=int, default=8766)
    args = parser.parse_args()
    flow_file = args.flow.resolve()
    flow = json.loads(flow_file.read_text(encoding="utf-8"))
    video = (flow_file.parent / flow["output"]).resolve()
    voiceover_output = flow.get("voiceoverOutput")
    if not voiceover_output:
        raise SystemExit(f"Flow {flow.get('flowId', flow_file.stem)} must define voiceoverOutput for its final narrated video.")
    final_voiceover = (flow_file.parent / voiceover_output).resolve()
    if not final_voiceover.is_relative_to(DEMO_ROOT):
        raise SystemExit(f"voiceoverOutput must stay inside {DEMO_ROOT}")
    if not video.is_file():
        raise SystemExit(f"Render the demo video before opening the studio: {video}")
    if not find_ffmpeg():
        raise SystemExit("FFmpeg is required. Install tsn-demo requirements-render.txt or add ffmpeg to PATH.")
    takes = video.parent / "voiceover" / "takes"
    takes.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), StudioHandler)
    server.flow_file = flow_file
    server.flow = flow
    server.takes_dir = takes
    server.final_voiceover = final_voiceover
    url = f"http://127.0.0.1:{args.port}/"
    print(f"TSN XP Voiceover Studio · {flow.get('title', flow['flowId'])}: {url}", flush=True)
    print("Recording uploads and mastering stay on this computer. Press Ctrl+C to stop.", flush=True)
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nVoiceover Studio stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
