#!/usr/bin/env python
"""Emits placeholder app icons (pure stdlib PNG writer — no Pillow needed).

These exist so the PWA is installable and the manifest validates. Real card and
app art lands in week 10; replace these then (same paths, same sizes).

Usage: python scripts/make-icons.py
"""
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "icons"

INK = (0x0B, 0x0A, 0x12)
INK_MID = (0x19, 0x16, 0x27)
GOLD = (0xFF, 0xCF, 0x4D)
GOLD_DEEP = (0xE0, 0xA9, 0x29)


def png_bytes(width, height, pixels):
    """pixels: list of rows, each row a list of (r, g, b) tuples."""
    raw = b"".join(
        b"\x00" + b"".join(struct.pack("BBB", *px) for px in row) for row in pixels
    )

    def chunk(tag, data):
        payload = tag + data
        return struct.pack(">I", len(data)) + payload + struct.pack(">I", zlib.crc32(payload))

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def icon(size):
    """Dark circle-free square with a gold diamond over a soft vignette."""
    cx = cy = (size - 1) / 2
    outer = size * 0.36
    inner = size * 0.19
    band = size * 0.022

    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            dx, dy = abs(x - cx), abs(y - cy)
            ring1 = dx + dy
            # soft radial vignette
            dist = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 / (size / 2)
            blend = min(1.0, max(0.0, dist))
            base = tuple(
                round(INK[i] + (INK_MID[i] - INK[i]) * blend) for i in range(3)
            )

            if ring1 <= inner:
                colour = GOLD
            elif abs(ring1 - outer) <= band:
                colour = GOLD_DEEP
            else:
                colour = base
            row.append(colour)
        rows.append(row)
    return png_bytes(size, size, rows)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        (OUT / f"icon-{size}.png").write_bytes(icon(size))
        print(f"wrote public/icons/icon-{size}.png")


if __name__ == "__main__":
    main()
