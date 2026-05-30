#!/usr/bin/env python3
"""Generate portable wiki markdown projections from docs/handbook HTML.

Uses only Python standard library so it can run in minimal GitLab CI jobs.
"""

from __future__ import annotations

import argparse
import re
from html.parser import HTMLParser
from pathlib import Path


SPINE = [
    "doctrine",
    "data",
    "schema",
    "boundary",
    "topology",
    "flow",
    "logic",
    "executor",
    "proof",
    "workflow",
]


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "page"


class HandbookHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.stack: list[str] = []
        self.current: list[str] = []
        self.items: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in {"title", "h1", "h2", "h3", "p", "li"}:
            self.stack.append(tag)
            self.current = []

    def handle_endtag(self, tag: str) -> None:
        if self.stack and self.stack[-1] == tag:
            text = " ".join("".join(self.current).split())
            if text:
                self.items.append((tag, text))
            self.stack.pop()
            self.current = []

    def handle_data(self, data: str) -> None:
        if self.stack:
            self.current.append(data)


def html_to_markdown(path: Path, root: Path) -> tuple[str, str]:
    parser = HandbookHTMLParser()
    parser.feed(path.read_text(encoding="utf-8"))
    title = next((text for tag, text in parser.items if tag == "h1"), None)
    if title is None:
        title = next((text for tag, text in parser.items if tag == "title"), path.stem)
    lines = [
        f"# {title}",
        "",
        "> Generated wiki projection. Source truth stays in "
        f"`{path.relative_to(root).as_posix()}`.",
        "",
    ]

    for tag, text in parser.items:
        if tag in {"title", "h1"}:
            continue
        if tag == "h2":
            lines.extend(["", f"## {text}", ""])
        elif tag == "h3":
            lines.extend(["", f"### {text}", ""])
        elif tag == "li":
            lines.append(f"- {text}")
        else:
            lines.extend([text, ""])

    return title, "\n".join(lines).rstrip() + "\n"


def discover_pages(root: Path) -> list[Path]:
    handbook = root / "docs" / "handbook"
    if not (handbook / "index.html").exists():
        return []
    return sorted(handbook.glob("*.html"), key=lambda p: (p.name != "index.html", p.name))


def write_platform(out: Path, platform: str, pages: list[tuple[str, str, str]]) -> None:
    target = out / platform
    target.mkdir(parents=True, exist_ok=True)
    home_name = "home.md" if platform == "gitlab" else "Home.md"
    sidebar_name = "_sidebar.md" if platform == "gitlab" else "_Sidebar.md"

    title, slug, content = pages[0]
    (target / home_name).write_text(content, encoding="utf-8")

    sidebar = ["# Handbook", ""]
    home_link = "home" if platform == "gitlab" else "Home"
    sidebar.append(f"- [Home]({home_link})")
    for title, slug, _content in pages[1:]:
        sidebar.append(f"- [{title}]({slug})")
    (target / sidebar_name).write_text("\n".join(sidebar) + "\n", encoding="utf-8")

    for title, slug, content in pages[1:]:
        (target / f"{slug}.md").write_text(content, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".", help="repository/worktree root")
    parser.add_argument("--out", default=".build/wiki", help="output directory")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    out = Path(args.out).resolve()
    html_pages = discover_pages(root)
    if not html_pages:
        print("no handbook found; no-op")
        return 0

    pages: list[tuple[str, str, str]] = []
    for path in html_pages:
        title, content = html_to_markdown(path, root)
        slug = "home" if path.name == "index.html" else slugify(path.stem)
        pages.append((title, slug, content))

    for platform in ("gitlab", "github", "codeberg"):
        write_platform(out, platform, pages)

    print(f"generated {len(pages)} pages for gitlab, github, codeberg at {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
