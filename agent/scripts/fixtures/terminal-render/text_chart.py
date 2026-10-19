#!/usr/bin/env python3
"""text_chart.py — the same 30 daily values charted as plain text.

The terminal-independent path: braille via plotext, plus an asciichartpy line of
the same series when that package is present. Output is real tool output, not text
typed into a reply, so it survives a PR body, a CI log or a pasted log.

    uv run --with 'plotext<6' --with asciichartpy python agent/scripts/fixtures/terminal-render/text_chart.py

Pin plotext `<6`. 6.x is a rewrite that drops `plot`/`scatter`/`date_form`:

    uv run --with 'plotext>=6' python agent/scripts/fixtures/terminal-render/text_chart.py
    # AttributeError: module 'plotext' has no attribute 'date_form'
"""

from __future__ import annotations

from datetime import date, timedelta

import plotext as plt

VALUES = [
    14, 13, 18, 21, 19, 16, 22, 25, 24, 20,
    23, 27, 26, 22, 18, 17, 21, 24, 28, 30,
    27, 25, 22, 19, 20, 23, 26, 29, 27, 24,
]

LAST_DAY = date(2026, 10, 12)


def dates() -> list[str]:
    return [
        (LAST_DAY - timedelta(days=len(VALUES) - 1 - i)).strftime("%d/%m/%Y")
        for i in range(len(VALUES))
    ]


def braille() -> None:
    plt.date_form("d/m/Y")
    plt.plotsize(80, 20)
    plt.theme("pro")
    plt.title("30 daily values - plotext braille")
    plt.plot(dates(), VALUES, marker="braille")
    plt.show()


def ascii_line() -> None:
    try:
        import asciichartpy as ac
    except ImportError:
        print()
        print("[asciichartpy is not installed - skipping the ASCII line]")
        return
    print()
    print("30 daily values - asciichartpy")
    print(ac.plot(VALUES, {"height": 12}))


def main() -> int:
    braille()
    ascii_line()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
