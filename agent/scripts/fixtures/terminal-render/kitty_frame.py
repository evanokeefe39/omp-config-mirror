#!/usr/bin/env python3
"""kitty_frame.py — prove a command can put a real image into the transcript.

Draws a bar chart with Pillow, writes the PNG to the system temp directory (never
into the repo), prints that path, and then emits the same PNG as a Kitty graphics
frame on stdout: one `a=T` transmit-and-display frame, base64-chunked at 4096
characters with `m=1` on every chunk but the last.

    uv run --with pillow python agent/scripts/fixtures/terminal-render/kitty_frame.py

On a terminal omp has detected as graphics-capable, the bar chart appears inline.
The red case is the payload, not the frame: emit `bm90LWEtcG5nIQ==` ("not-a-png!")
in place of the real base64 and the frame reaches the transcript as text.
"""

from __future__ import annotations

import base64
import io
import os
import sys
import tempfile

from PIL import Image, ImageDraw

ESC = "\x1b"
CHUNK = 4096
OUT_NAME = "omp-kitty-probe.png"
VALUES = [14, 13, 18, 21, 19, 16, 22, 25, 24, 20]


def build_chart() -> Image.Image:
    width, height = 480, 300
    img = Image.new("RGB", (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    pad_l, pad_r, pad_t, pad_b = 50, 24, 40, 40
    plot_w = width - pad_l - pad_r
    plot_h = height - pad_t - pad_b
    baseline = pad_t + plot_h
    top = max(VALUES)

    axis = (148, 163, 184)
    draw.line([(pad_l, pad_t), (pad_l, baseline)], fill=axis, width=2)
    draw.line([(pad_l, baseline), (pad_l + plot_w, baseline)], fill=axis, width=2)

    slot = plot_w / len(VALUES)
    bar_w = slot * 0.6
    for i, value in enumerate(VALUES):
        x0 = pad_l + i * slot + (slot - bar_w) / 2
        y0 = baseline - (value / top) * plot_h
        draw.rectangle([x0, y0, x0 + bar_w, baseline], fill=(37, 99, 235))

    draw.text((pad_l, 14), "omp kitty probe - 10 daily values", fill=(15, 23, 42))
    return img


def png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def emit_kitty(png: bytes) -> None:
    payload = base64.b64encode(png).decode("ascii")
    chunks = [payload[i : i + CHUNK] for i in range(0, len(payload), CHUNK)]
    frames = []
    for index, chunk in enumerate(chunks):
        more = 0 if index == len(chunks) - 1 else 1
        frames.append(f"{ESC}_Gf=100,a=T,m={more};{chunk}{ESC}\\")
    sys.stdout.write("".join(frames) + "\n")
    sys.stdout.flush()


def main() -> int:
    png = png_bytes(build_chart())
    path = os.path.join(tempfile.gettempdir(), OUT_NAME)
    with open(path, "wb") as handle:
        handle.write(png)
    print(path)
    emit_kitty(png)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
