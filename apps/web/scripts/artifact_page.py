#!/usr/bin/env python3
"""Make the claude.ai artifact page from standalone/index.html.

The artifact host wraps the page in its own document, so the doctype, <html>, <head>, <body>,
charset and viewport tags come out, the title becomes "Hashcoin Website", and scroll-reveal
effects are switched off (they can stay invisible inside the preview frame).

Usage (from the repo root, after build_standalone.py):
    python3 apps/web/scripts/artifact_page.py [out_dir]
    python3 apps/web/scripts/artifact_page.py --title "Hashcoin Redesign Pre-launch" [out_dir]   # another title
    python3 apps/web/scripts/artifact_page.py --live-preview   # standalone-live/ -> .artifact-live/, titled
                                                               # "Hashcoin Live Preview"; publish it as its own
                                                               # artifact, never to the preview link below

Writes out_dir/main.html (the page) and copies calculator.html, faq.html and antivirus.html beside it.
out_dir defaults to apps/web/.artifact/ (git-ignored). Then publish with the Artifact tool:
    url       = https://claude.ai/artifact/6mwmqXA78PGKKqr17gNmSc
    file_path = <out_dir>/main.html
    files     = {"calculator.html": "<out_dir>/calculator.html", "faq.html": "<out_dir>/faq.html", "antivirus.html": "<out_dir>/antivirus.html"}
"""
import re
import shutil
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent
PREVIEW = "--live-preview" in sys.argv
SRC = WEB / ("standalone-live" if PREVIEW else "standalone")


def main() -> None:
    argv = sys.argv[1:]
    title = None
    if "--title" in argv:
        i = argv.index("--title")
        title = argv[i + 1]
        del argv[i:i + 2]
    args = [a for a in argv if a != "--live-preview"]
    out = Path(args[0]) if args else WEB / (".artifact-live" if PREVIEW else ".artifact")
    out.mkdir(parents=True, exist_ok=True)
    h = (SRC / "index.html").read_text(encoding="utf-8")
    h = re.sub(r"<!doctype html>\s*", "", h, flags=re.I)
    for tag in ("html", "head", "body"):
        h = re.sub(rf"</?{tag}[^>]*>", "", h)
    h = re.sub(r"<meta charset[^>]*>", "", h, flags=re.I)
    h = re.sub(r'<meta name="viewport"[^>]*>', "", h)
    title = title or ("Hashcoin Live Preview" if PREVIEW else "Hashcoin Website")
    h = re.sub(r"<title>.*?</title>", f"<title>{title}</title>", h, count=1, flags=re.S)
    h = h.replace("</style>", ".reveal { opacity: 1 !important; transform: none !important; }\n</style>", 1)
    (out / "main.html").write_text(h, encoding="utf-8", newline="\n")
    for name in ("calculator.html", "faq.html", "antivirus.html"):
        shutil.copyfile(SRC / name, out / name)
    print(f"wrote {out / 'main.html'} ({len(h) // 1024} KB), calculator.html, faq.html, antivirus.html")


if __name__ == "__main__":
    main()
