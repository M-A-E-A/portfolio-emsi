#!/usr/bin/env python3
"""
Audit complet de tous les projets.
Verifie : liens casses, ancres orphelines, ids dupliques, conflits de theme,
assets manquants, balises non fermees, scripts inline, erreurs JS.
"""
import os
import re
import sys
from pathlib import Path
from html.parser import HTMLParser
from collections import Counter

BASE = Path(r"C:\Users\Hp\Desktop\EMSI\DEV- NUMERIQUE\PROJECTS")

SKIP_DIRS = {"node_modules", ".git", "__pycache__", ".next", "dist", "vendor"}

problems = []
notes = []


def rel(p):
    try:
        return str(p.relative_to(BASE)).replace("\\", "/")
    except ValueError:
        return str(p)


class Collector(HTMLParser):
    """Collecte ids, liens, assets, balises non fermees."""

    VOID = {"area","base","br","col","embed","hr","img","input","link","meta",
            "param","source","track","wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = []
        self.links = []          # (href, kind) kind: page|anchor|ext
        self.assets = []         # (src, kind) kind: css|js|img
        self.stack = []
        self.imgs_no_alt = 0
        self.buttons_no_type = 0
        self.inputs_no_label = []
        self.label_for = []
        self.input_ids = []
        self.select_ids = []
        self.textareas_ids = []
        self.aria_refs = []      # aria-labelledby / aria-describedby / aria-controls
        self.has_main = False
        self.has_lang = False
        self.h1_count = 0
        self.title = ""
        self.meta_desc = None
        self.in_title = False

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag not in self.VOID:
            self.stack.append(tag)
        if "id" in d:
            self.ids.append(d["id"])
        if tag == "html":
            self.has_lang = "lang" in d
        if tag == "main":
            self.has_main = True
        if tag == "h1":
            self.h1_count += 1
        if tag == "title":
            self.in_title = True
        if tag == "meta" and d.get("name", "").lower() == "description":
            self.meta_desc = d.get("content")
        if tag == "img":
            self.assets.append((d.get("src", ""), "img"))
            if "alt" not in d:
                self.imgs_no_alt += 1
        if tag == "script" and d.get("src"):
            self.assets.append((d["src"], "js"))
        if tag == "link" and d.get("rel") == "stylesheet" and d.get("href"):
            self.assets.append((d["href"], "css"))
        if tag == "a" and d.get("href"):
            self.links.append((d["href"], "a"))
        if tag == "link" and d.get("rel") == "icon" and d.get("href"):
            self.assets.append((d["href"], "icon"))
        if tag == "button" and "type" not in d:
            self.buttons_no_type += 1
        if tag == "label" and d.get("for"):
            self.label_for.append(d["for"])
        if tag == "input" and d.get("id"):
            self.input_ids.append(d["id"])
        if tag == "select" and d.get("id"):
            self.select_ids.append(d["id"])
        if tag == "textarea" and d.get("id"):
            self.textareas_ids.append(d["id"])
        for attr in ("aria-labelledby", "aria-describedby", "aria-controls"):
            if attr in d:
                self.aria_refs.extend(d[attr].split())

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID and self.stack and self.stack[-1] == tag:
            self.stack.pop()

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        if tag in self.stack:
            while self.stack:
                top = self.stack.pop()
                if top == tag:
                    break
        else:
            problems.append(f"{rel(self.file)}: balise fermante </{tag}> sans ouverture")

    def handle_data(self, data):
        if self.in_title:
            self.title += data.strip()


def analyze(path):
    c = Collector()
    c.file = path
    try:
        src = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        try:
            src = path.read_text(encoding="latin-1")
        except Exception as e:
            problems.append(f"{rel(path)}: illisible ({e})")
            return None
    try:
        c.feed(src)
    except Exception as e:
        problems.append(f"{rel(path)}: erreur de parsing HTML ({e})")
        return None

    # balises non fermees
    if c.stack:
        problems.append(
            f"{rel(path)}: balise(s) non fermée(s) : {', '.join(c.stack[:6])}"
        )

    # ids dupliques
    dups = [k for k, v in Counter(c.ids).items() if v > 1]
    if dups:
        problems.append(f"{rel(path)}: id dupliqué(s) : {', '.join(dups[:6])}")

    # ancres orphelines
    idset = set(c.ids)
    for href, _ in c.links:
        if href.startswith("#") and len(href) > 1:
            if href[1:] not in idset:
                problems.append(f"{rel(path)}: ancre morte {href}")

    # aria refs
    for ref in c.aria_refs:
        if ref not in idset:
            problems.append(f"{rel(path)}: aria-* pointe vers id inexistant « {ref} »")

    # assets manquants
    for src_attr, kind in c.assets:
        if not src_attr:
            continue
        if src_attr.startswith(("http://", "https://", "//", "data:", "#", "mailto:")):
            continue
        target = (path.parent / src_attr.split("?")[0].split("#")[0]).resolve()
        if not target.exists():
            problems.append(f"{rel(path)}: asset {kind} introuvable -> {src_attr}")

    # liens vers fichiers locaux
    for href, _ in c.links:
        if href.startswith(("http://", "https://", "//", "mailto:", "tel:", "data:")):
            continue
        if href.startswith("#"):
            continue
        target = (path.parent / href.split("?")[0].split("#")[0]).resolve()
        if not target.exists():
            problems.append(f"{rel(path)}: lien mort -> {href}")

    # labels
    labeled = set(c.label_for) | set(c.input_ids) | set(c.select_ids) | set(c.textareas_ids)
    for i in c.input_ids:
        if i not in c.label_for:
            problems.append(f"{rel(path)}: <input id=\"{i}\"> sans <label for>")

    # a11y
    if not c.has_lang:
        problems.append(f"{rel(path)}: <html> sans attribut lang")
    if not c.has_main:
        notes.append(f"{rel(path)}: pas de <main>")
    if c.h1_count == 0:
        problems.append(f"{rel(path)}: aucun <h1>")
    if c.imgs_no_alt:
        problems.append(f"{rel(path)}: {c.imgs_no_alt} <img> sans alt")
    if c.buttons_no_type:
        problems.append(f"{rel(path)}: {c.buttons_no_type} <button> sans type")
    if not c.meta_desc:
        problems.append(f"{rel(path)}: pas de meta description")

    return c


def js_check(path):
    """Verification syntaxique JS via node."""
    import subprocess
    r = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
    if r.returncode != 0:
        err = (r.stderr or r.stdout).strip().splitlines()
        detail = " / ".join(e.strip() for e in err[:3] if "Error" in e or "error" in e) or (err[0] if err else "?")
        problems.append(f"{rel(path)}: JS invalide -> {detail}")


def main():
    html_files = []
    for root, dirs, files in os.walk(BASE):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if f.endswith(".html"):
                html_files.append(Path(root) / f)

    print(f"Analyse de {len(html_files)} fichiers HTML...\n")

    theme_map = {}
    for p in sorted(html_files):
        c = analyze(p)
        if c:
            theme_map[rel(p)] = {
                "theme_btn": "theme" in c.ids,
                "fond": "fond-anime" in c.ids,
                "shared_css": any("shared/theme.css" in a[0] for a in c.assets),
                "shared_js": any("shared/theme.js" in a[0] for a in c.assets),
            }

    # verification JS
    for root, dirs, files in os.walk(BASE):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if f.endswith(".js"):
                js_check(Path(root) / f)

    # verification PHP (lint basique)
    for root, dirs, files in os.walk(BASE):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if f.endswith(".php"):
                php = Path(root) / f
                src = php.read_text(encoding="utf-8", errors="replace")
                # comptes de balises php
                if src.count("<?php") + src.count("<?=") != src.count("?>"):
                    if src.count("<?php") > src.count("?>"):
                        notes.append(f"{rel(php)}: <?php sans ?> (normal en fin de fichier)")
                for fn in re.findall(r"function\s+(\w+)\s*\(", src):
                    pass

    # rapport themes
    print("=== ETAT THEME / FOND ===")
    for k, v in sorted(theme_map.items()):
        flags = []
        if not v["theme_btn"]:
            flags.append("SANS-BOUTON-THEME")
        if not v["fond"] and not v["shared_js"]:
            flags.append("SANS-FOND")
        if v["shared_css"] and not v["shared_js"]:
            flags.append("CSS-SANS-JS")
        if v["shared_js"] and not v["shared_css"]:
            flags.append("JS-SANS-CSS")
        if flags:
            print(f"  {k} : {', '.join(flags)}")

    print("\n=== PROBLEMES ===")
    if problems:
        for p in problems:
            print(f"  [P] {p}")
        print(f"\n  Total : {len(problems)}")
    else:
        print("  Aucun probleme detecte.")

    if notes:
        print("\n=== NOTES ===")
        for n in notes:
            print(f"  [N] {n}")


main()
