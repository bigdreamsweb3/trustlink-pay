from __future__ import annotations

import json
import re
import shutil
import subprocess
import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio_ffmpeg


ROOT = Path(__file__).resolve().parent
PACK = ROOT / "evidence" / "tin-creation-wallet-recovery"
FLOW_FILE = ROOT / "flows" / "tin-creation-wallet-recovery.json"
OUT = ROOT / "exports"
FRAMES = OUT / "working" / "frames"
SEGMENTS = OUT / "working" / "segments"
FFMPEG = Path(imageio_ffmpeg.get_ffmpeg_exe()) if shutil.which("ffmpeg") is None else Path(shutil.which("ffmpeg"))
W, H = 1920, 1080
BG = (7, 14, 12)
PANEL = (12, 24, 19)
PANEL2 = (16, 31, 25)
LINE = (43, 68, 55)
GREEN = (108, 226, 157)
PALE = (237, 238, 214)
MUTED = (156, 176, 163)
GOLD = (218, 187, 93)


def font(size: int, mono: bool = False, bold: bool = False) -> ImageFont.FreeTypeFont:
    base = Path("C:/Windows/Fonts")
    name = "consolab.ttf" if mono and bold else "consola.ttf" if mono else "seguisb.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(base / name), size)


def wrap(draw: ImageDraw.ImageDraw, text: str, ft: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    out, row = [], ""
    for word in text.split():
        candidate = (row + " " + word).strip()
        if draw.textbbox((0, 0), candidate, font=ft)[2] <= max_width:
            row = candidate
        else:
            if row:
                out.append(row)
            row = word
    if row:
        out.append(row)
    return out


def paragraph(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, ft: ImageFont.FreeTypeFont,
              fill: tuple[int, int, int], max_width: int, gap: int = 10, max_lines: int = 8) -> int:
    x, y = xy
    lines = wrap(draw, text, ft, max_width)[:max_lines]
    for line in lines:
        draw.text((x, y), line, font=ft, fill=fill)
        y += ft.size + gap
    return y


def rounded(draw: ImageDraw.ImageDraw, box, fill, outline=LINE, radius=18, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def capture(second: int, dest: Path) -> None:
    cmd = [str(FFMPEG), "-hide_banner", "-loglevel", "error", "-ss", str(second), "-i", str(SOURCE),
           "-frames:v", "1", "-update", "1", str(dest), "-y"]
    subprocess.run(cmd, check=True)


def media_duration(path: Path) -> float:
    result = subprocess.run([str(FFMPEG), "-hide_banner", "-i", str(path)], capture_output=True, text=True)
    match = re.search(r"Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)", result.stderr)
    if not match:
        raise RuntimeError(f"Could not read video duration: {path}")
    hours, minutes, seconds = match.groups()
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def fit_image(path: Path, box: tuple[int, int, int, int], radius: int = 14) -> Image.Image:
    x, y, w, h = box
    image = Image.open(path).convert("RGB")
    scale = min(w / image.width, h / image.height)
    image = image.resize((int(image.width * scale), int(image.height * scale)), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (w, h), (5, 10, 8))
    canvas.paste(image, ((w - image.width) // 2, (h - image.height) // 2))
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)
    return canvas


SCENES = [
    {
        "time": 5, "kicker": "TSN XP  /  SOLANA DEVNET", "title": "A human-readable identity for transfers.",
        "body": "A private TIN gives its owner a simple ten-digit identity to share when receiving a transfer.",
        "tag": "REAL XP CAPTURE  ·  DEVNET", "type": "hero",
    },
    {
        "time": 42, "kicker": "01  /  OWNER CREATION", "title": "Create with the owner wallet.",
        "body": "The owner enters a display name and approves the creation intent. Identity material is encrypted before submission.",
        "tag": "OWNER AUTHORIZATION  ·  NO FUNDS MOVED", "type": "creation",
    },
    {
        "time": 80, "kicker": "02  /  RECEIVER INGRESS", "title": "The Receiver accepts the intent.",
        "body": "The signed request enters the Receiver queue. Its encrypted envelope stays opaque to the Node.",
        "tag": "TIN OPERATION  ·  RECEIVER WORK QUEUE", "type": "receiver",
    },
    {
        "time": 101, "kicker": "03  /  NODE VERIFICATION", "title": "The Node verifies and attests.",
        "body": "The Node validates the owner authorization and request commitments, then records a signed Ed25519 verification decision.",
        "tag": "VERIFIED  ·  SIGNED NODE ATTESTATION", "type": "node",
    },
    {
        "time": 108, "kicker": "04  /  CRANKER SUBMISSION", "title": "The Cranker stages the registry write.",
        "body": "After verification, the Cranker submits five bounded staging transactions and the final registry transaction to Solana.",
        "tag": "5 STAGING WRITES  +  1 FINAL REGISTRY WRITE", "type": "cranker",
    },
    {
        "time": 110, "kicker": "05  /  SOLANA FINALITY", "title": "The ten-digit TIN is finalized.",
        "body": "The registry transaction finalized on Devnet. TSN XP displays the assigned identity and its owner name.",
        "tag": "FINALIZED  ·  SLOT 507029424", "type": "finality",
    },
    {
        "time": 177, "kicker": "06  /  WALLET RECOVERY", "title": "Reconnect without memorizing the number.",
        "body": "After reload, the owner reconnects and signs a recovery message. TSN XP decrypts the identity locally; no transaction is sent.",
        "tag": "OWNER SIGNATURE  ·  LOCAL DECRYPTION", "type": "recovery",
    },
]


def draw_scene(index: int, scene: dict, screenshot_path: Path | None, stage_rows: list[dict]) -> Path:
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    # restrained grid and top status bar
    for x in range(40, W, 80):
        d.line((x, 0, x, H), fill=(10, 19, 16), width=1)
    d.rectangle((0, 0, W, 8), fill=GREEN)
    d.text((76, 48), "TSN", font=font(36, bold=True), fill=PALE)
    d.text((168, 59), "TRANSFER SETTLEMENT NETWORK", font=font(18, mono=True, bold=True), fill=MUTED)
    d.rounded_rectangle((1556, 42, 1844, 94), radius=25, fill=(14, 31, 24), outline=LINE, width=2)
    d.ellipse((1580, 60, 1596, 76), fill=GREEN)
    d.text((1610, 54), "SOLANA DEVNET", font=font(18, mono=True, bold=True), fill=PALE)
    d.line((76, 120, 1844, 120), fill=LINE, width=2)

    d.text((76, 158), scene["kicker"], font=font(20, mono=True, bold=True), fill=GOLD)
    title_font = font(48, bold=True)
    ty = 202
    ty = paragraph(d, (76, ty), scene["title"], title_font, PALE, 1750, gap=4, max_lines=2)
    d.text((76, ty + 10), scene["body"], font=font(25), fill=MUTED)

    # source recording left; evidence/context rail right
    sx, sy, sw, sh = 76, 330, 1130, 572
    rounded(d, (sx - 5, sy - 5, sx + sw + 5, sy + sh + 5), (9, 17, 14), LINE, 20, 2)
    if screenshot_path is not None:
        shot = Image.open(screenshot_path).convert("RGB")
        scale = min(sw / shot.width, sh / shot.height)
        shot = shot.resize((int(shot.width * scale), int(shot.height * scale)), Image.Resampling.LANCZOS)
        xx, yy = sx + (sw - shot.width) // 2, sy + (sh - shot.height) // 2
        im.paste(shot, (xx, yy))
    else:
        d.rounded_rectangle((sx + 16, sy + 15, sx + 266, sy + 52), radius=16, fill=(5, 14, 10), outline=LINE, width=1)
        d.text((sx + 31, sy + 24), "LIVE RECORDING  /  3×", font=font(14, mono=True, bold=True), fill=GREEN)

    rx, ry, rw, rh = 1240, 330, 604, 572
    rounded(d, (rx, ry, rx + rw, ry + rh), PANEL, LINE, 20, 2)
    d.text((rx + 32, ry + 28), "FLOW EVIDENCE", font=font(17, mono=True, bold=True), fill=GOLD)
    y = ry + 75
    kind = scene["type"]
    if kind in ("hero", "creation"):
        rows = [("OWNER", "Wallet-signed intent"), ("IDENTITY", "Encrypted before ingress"), ("TIN", "Assigned by the program")]
        for label, value in rows:
            d.text((rx + 32, y), label, font=font(14, mono=True, bold=True), fill=MUTED)
            d.text((rx + 32, y + 28), value, font=font(21, bold=True), fill=PALE)
            y += 105
    elif kind == "receiver":
        rows = [("RECEIVER", "Accepted owner intent"), ("WORK", "TIN_OPERATION"), ("PAYLOAD", "Commitment-bound"), ("PRIVATE BYTES", "Not repeated in video")]
        for label, value in rows:
            d.text((rx + 32, y), label, font=font(14, mono=True, bold=True), fill=MUTED)
            d.text((rx + 32, y + 26), value, font=font(20, mono=value == "TIN_OPERATION", bold=value != "TIN_OPERATION"), fill=PALE)
            y += 82
    elif kind == "node":
        rows = [("DECISION", "VERIFIED"), ("ATTESTATION", "Ed25519 signed"), ("SCOPE", "Owner authorization + commitments"), ("PRIVACY", "Envelope remains opaque")]
        for label, value in rows:
            d.text((rx + 32, y), label, font=font(14, mono=True, bold=True), fill=MUTED)
            y = paragraph(d, (rx + 32, y + 24), value, font(20, mono=value == "VERIFIED", bold=True), GREEN if value == "VERIFIED" else PALE, rw - 64, 6, 2) + 17
    elif kind == "cranker":
        d.text((rx + 32, y), "CRANKER", font=font(14, mono=True, bold=True), fill=MUTED)
        d.text((rx + 32, y + 25), "Verified work → staged writes", font=font(19, bold=True), fill=PALE)
        y += 75
        for i, row in enumerate(stage_rows, 1):
            status = "FINAL" if i == len(stage_rows) else f"STAGE 0{i}"
            color = GREEN if i == len(stage_rows) else PALE
            sig = row["signature"]
            d.rounded_rectangle((rx + 28, y, rx + rw - 28, y + 54), radius=9, fill=PANEL2, outline=LINE, width=1)
            d.text((rx + 42, y + 8), status, font=font(13, mono=True, bold=True), fill=color)
            d.text((rx + 152, y + 8), sig[:12] + "…" + sig[-8:], font=font(14, mono=True), fill=PALE)
            d.text((rx + 152, y + 31), f"SLOT {row['slot']}  ·  FINALIZED", font=font(12, mono=True), fill=MUTED)
            y += 60
        d.text((rx + 32, ry + rh - 38), "CRANKER LEASE ID NOT RETAINED IN FINAL SNAPSHOT", font=font(11, mono=True), fill=MUTED)
    elif kind == "finality":
        rows = [("TIN", "8642663057"), ("REGISTRY TX", "5DqdWoiu…RP8Ys"), ("STATUS", "FINALIZED"), ("SLOT", "507029424")]
        for label, value in rows:
            d.text((rx + 32, y), label, font=font(14, mono=True, bold=True), fill=MUTED)
            d.text((rx + 32, y + 24), value, font=font(27 if label == "TIN" else 20, mono=label in ("REGISTRY TX", "SLOT"), bold=True), fill=GREEN if label in ("TIN", "STATUS") else PALE)
            y += 91
        d.text((rx + 32, ry + rh - 53), "5 STAGING + 1 REGISTRY TX  ·  ALL FINALIZED", font=font(13, mono=True, bold=True), fill=GOLD)
    elif kind == "recovery":
        rows = [("OWNER WALLET", "Reconnect same wallet"), ("APPROVAL", "One recovery message"), ("DECRYPTION", "Local to TSN XP"), ("CHAIN TX", "None required")]
        for label, value in rows:
            d.text((rx + 32, y), label, font=font(14, mono=True, bold=True), fill=MUTED)
            d.text((rx + 32, y + 24), value, font=font(20, bold=True), fill=PALE)
            y += 91
        rounded(d, (rx + 24, ry + rh - 146, rx + rw - 24, ry + rh - 24), PANEL2, LINE, 12, 1)
        d.text((rx + 42, ry + rh - 132), "TSN SDK / recoverTinV1IdentityForOwner", font=font(12, mono=True, bold=True), fill=GOLD)
        for line_no, code in enumerate(("const identity = await", "  recoverTinV1IdentityForOwner({", "    connection, ownerPubkey,", "    programId, signMessage", "  });")):
            d.text((rx + 42, ry + rh - 105 + line_no * 17), code, font=font(13, mono=True), fill=PALE)
    else:
        rows = [("IDENTITY", "TIN 8642663057"), ("DISPLAY NAME", "Daniel TrustLINK LABS"), ("OWNER", "Recovered by wallet"), ("NETWORK", "Solana Devnet")]
        for label, value in rows:
            d.text((rx + 32, y), label, font=font(14, mono=True, bold=True), fill=MUTED)
            d.text((rx + 32, y + 24), value, font=font(21, bold=True), fill=GREEN if label == "IDENTITY" else PALE)
            y += 91

    # timeline and narration-ready line
    d.line((76, 948, 1844, 948), fill=LINE, width=2)
    d.text((76, 974), scene["tag"], font=font(17, mono=True, bold=True), fill=GREEN)
    d.text((76, 1026), "TSN XP  •  OWNER-CONTROLLED IDENTITY  •  ON-CHAIN SETTLEMENT", font=font(15, mono=True), fill=MUTED)
    progress_x = 1420
    d.rounded_rectangle((progress_x, 1003, 1844, 1017), radius=7, fill=(24, 40, 32))
    segw = 424 / len(SCENES)
    for j in range(index + 1):
        left = progress_x + int(j * segw)
        right = progress_x + int((j + 1) * segw) - 3
        d.rounded_rectangle((left, 1003, right, 1017), radius=7, fill=GREEN if j <= index else (24, 40, 32))
    d.text((progress_x, 1031), f"{index + 1:02d}  /  {len(SCENES):02d}", font=font(13, mono=True, bold=True), fill=GOLD)
    result = FRAMES / f"scene-{index + 1:02d}.png"
    im.save(result, optimize=True)
    return result


def main() -> None:
    global FRAMES, SEGMENTS
    parser = argparse.ArgumentParser(description="Render a TSN demo flow from its JSON timeline.")
    parser.add_argument("--flow", type=Path, default=FLOW_FILE,
                        help="Flow JSON, relative to the current directory or absolute path.")
    args = parser.parse_args()
    flow_file = args.flow.resolve()
    flow = json.loads(flow_file.read_text(encoding="utf-8"))
    source = (flow_file.parent / flow["source"]).resolve()
    final = (flow_file.parent / flow["output"]).resolve()
    flow_working = final.parent / "working"
    FRAMES = flow_working / "frames"
    SEGMENTS = flow_working / "segments"
    for folder in (final.parent, FRAMES, SEGMENTS):
        folder.mkdir(parents=True, exist_ok=True)
    music = (flow_file.parent / flow["music"]).resolve() if flow.get("music") else None
    picture_output = final.with_name(final.stem + ".picture.mp4") if music and music.exists() else final
    fps = int(flow.get("fps", 12))
    if not source.exists():
        raise FileNotFoundError(source)
    if not FFMPEG.exists():
        raise FileNotFoundError(f"ffmpeg not found: {FFMPEG}")
    if not flow.get("clips"):
        raise ValueError("Flow config must include at least one clip")
    for clip in flow["clips"]:
        if clip["sourceEnd"] <= clip["sourceStart"] or clip["speed"] <= 0:
            raise ValueError(f"Invalid source range or speed in clip: {clip.get('id')}")
        if clip["scene"] not in {scene["type"] for scene in SCENES}:
            raise ValueError(f"Unknown scene '{clip['scene']}' in clip: {clip.get('id')}")
        if clip.get("transitionSeconds", 0) < 0:
            raise ValueError(f"Negative transition duration in clip: {clip.get('id')}")
    records = json.loads((PACK / "solana-staged-transactions.json").read_text(encoding="utf-8"))
    stage_rows = records["stagedTransactions"] + [records["finalTransaction"]]
    # Continuous screen footage plays inside the original detailed evidence layout.
    # The one source-time gap is labeled as the reload/recovery step.
    scene_by_type = {scene["type"]: scene for scene in SCENES}
    segments: list[tuple[Path, float, float]] = []
    for segment_no, clip in enumerate(flow["clips"], 1):
        scene = scene_by_type[clip["scene"]]
        layout = draw_scene(segment_no - 1, scene, None, stage_rows)
        target = SEGMENTS / f"{clip['id']}.mp4"
        duration = float(clip["sourceEnd"]) - float(clip["sourceStart"])
        speed = float(clip["speed"])
        # Speed compresses pauses while retaining the recording. Normalize fps; no pan or zoom.
        vf = ("[0:v]trim=duration=" + str(duration) + ",setpts=(PTS-STARTPTS)/" + str(speed) + ","
              "scale=1130:572:force_original_aspect_ratio=decrease,pad=1130:572:(ow-iw)/2:(oh-ih)/2:color=black,"
              f"fps={fps}[footage];"
              "[1:v][footage]overlay=76:330:shortest=1,scale=1280:720,format=yuv420p[out]")
        args = [str(FFMPEG), "-hide_banner", "-loglevel", "error", "-y", "-ss", str(clip["sourceStart"]), "-i", str(source),
                "-loop", "1", "-framerate", str(fps), "-i", str(layout), "-filter_complex", vf,
                "-map", "[out]", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "25",
                "-t", str(duration / speed), "-movflags", "+faststart", str(target)]
        subprocess.run(args, check=True)
        segments.append((target, duration / speed, float(clip.get("transitionSeconds", 0))))

    current = segments[0][0]
    timeline_duration = media_duration(current)
    for i in range(1, len(segments)):
        next_clip, next_duration, requested_fade = segments[i]
        next_duration = media_duration(next_clip)
        fade = min(requested_fade, timeline_duration, next_duration)
        if fade <= 0:
            # A zero-duration transition is an intentional hard cut.
            concat_list = SEGMENTS / "hard-cut-concat.txt"
            with concat_list.open("w", encoding="utf-8", newline="\n") as f:
                for path in (current, next_clip):
                    escaped = str(path).replace("\\", "/").replace("'", "'\\''")
                    f.write(f"file '{escaped}'\n")
            target = picture_output if i == len(segments) - 1 else SEGMENTS / f"blendstep-{i + 1:02d}.mp4"
            args = [str(FFMPEG), "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list),
                    "-c", "copy", "-movflags", "+faststart", str(target)]
            subprocess.run(args, check=True)
            timeline_duration = media_duration(target)
        else:
            target = picture_output if i == len(segments) - 1 else SEGMENTS / f"blendstep-{i + 1:02d}.mp4"
            transition_start = timeline_duration - fade
            vf = (f"[0:v]fps={fps}[a];[1:v]setpts=PTS+{transition_start:.3f}/TB,fps={fps}[b];"
                  f"[a][b]xfade=transition=fade:duration={fade}:offset={transition_start:.3f}[out]")
            args = [str(FFMPEG), "-hide_banner", "-loglevel", "error", "-y", "-i", str(current), "-i", str(next_clip),
                    "-filter_complex", vf, "-map", "[out]", "-an", "-c:v", "libx264", "-preset", "veryfast",
                    "-crf", "25", "-r", str(fps), "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(target)]
            subprocess.run(args, check=True)
            timeline_duration = media_duration(target)
        current = target
    if music and music.exists():
        volume = max(0.0, min(1.0, float(flow.get("musicVolume", 0.12))))
        fade_out = max(0.0, min(float(flow.get("musicFadeOutSeconds", 1.5)), timeline_duration))
        fade_start = max(0.0, timeline_duration - fade_out)
        audio_filter = f"[1:a]volume={volume:.3f}"
        if fade_out > 0:
            audio_filter += f",afade=t=out:st={fade_start:.3f}:d={fade_out:.3f}"
        audio_filter += "[music]"
        args = [str(FFMPEG), "-hide_banner", "-loglevel", "error", "-y", "-i", str(current),
                "-stream_loop", "-1", "-i", str(music), "-filter_complex", audio_filter,
                "-map", "0:v:0", "-map", "[music]", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
                "-t", f"{timeline_duration:.3f}", "-movflags", "+faststart", str(final)]
        subprocess.run(args, check=True)
        current = final
        picture_output.unlink(missing_ok=True)
    print(f"Rendered: {final}")
    print(f"Duration target: {timeline_duration:.2f}s")
    print(f"Bytes: {final.stat().st_size}")


if __name__ == "__main__":
    main()
