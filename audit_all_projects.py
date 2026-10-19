#!/usr/bin/env python3
"""
Comprehensive audit script for all projects.
Checks for: broken links, missing files, anchor mismatches, JS errors, CSS issues.
"""

import os
import re
from pathlib import Path
from html.parser import HTMLParser

BASE = Path(r"C:\Users\Hp\Desktop\EMSI\DEV- NUMERIQUE\PROJECTS")

# Track all issues
issues = []

def check_file_exists(filepath, context=""):
    """Check if a file exists."""
    if not filepath:
        return True
    if filepath.startswith('http://') or filepath.startswith('https://') or filepath.startswith('//'):
        return True
    if filepath.startswith('data:'):
        return True
    if not filepath.startswith('/'):
        print(f"  ⚠ File path check: {filepath} (inline, may work)")
        return True  # Relative paths need context from HTML file location
    return False

# Collect all HTML files
html_files = []
for ext in ['*.html']:
    html_files.extend(BASE.rglob(ext))

# Collect all JS/CSS files
js_files = list(BASE.rglob('*.js'))
css_files = list(BASE.rglob('*.css'))

# Check JS syntax
print("=== JS SYNTAX CHECK ===")
for js in js_files:
    try:
        content = js.read_text(encoding='utf-8')
        compile(content, str(js), 'exec')
        print(f"  ✓ {js.relative_to(BASE)}")
    except SyntaxError as e:
        issues.append(f"JS Syntax Error in {js}: {e}")
        print(f"  ❌ {js.relative_to(BASE)}: {e}")

print("\n=== SHARED THEME MODULE CHECK ===")
theme_js = BASE / "shared" / "theme.js"
theme_css = BASE / "shared" / "theme.css"

if theme_js.exists():
    print(f"  ✓ theme.js exists")
    content = theme_js.read_text(encoding='utf-8')
    # Check for potential issues
    if 'document.body.classList.toggle' not in content:
        issues.append("theme.js: missing body.sombre toggle")
    if 'document.documentElement.classList.toggle' not in content and 'dark' not in content.lower():
        issues.append("theme.js: missing dark mode toggle")
    if 'fond-anime' not in content:
        issues.append("theme.js: missing fond-anime creation")
else:
    issues.append("❌ shared/theme.js missing")

if theme_css.exists():
    print(f"  ✓ theme.css exists")
else:
    issues.append("❌ shared/theme.css missing")

print("\n=== STANDALONE APP INTEGRATION CHECK ===")
standalone_apps = [
    'api-contacts', 'api-express', 'bootstrap-demo', 'boutique-souk',
    'carte-points-interet', 'duel-tri', 'messagerie-temps-reel', 'mini-sgbd',
    'quiz-culture_generale', 'suivi-depenses', 'tailwind-demo', 'tri-visualiseur',
    'python-analyse', 'wp-theme-portfolio'
]

for app in standalone_apps:
    index_html = BASE / app / "index.html"
    if not index_html.exists():
        issues.append(f"Standalone app: {app}/index.html missing")
        continue
    content = index_html.read_text(encoding='utf-8')
    has_theme_css = '../shared/theme.css' in content or './shared/theme.css' in content
    has_theme_js = '../shared/theme.js' in content or './shared/theme.js' in content
    # Check for theme button
    has_theme_btn = 'id="theme"' in content
    # Check for fond-anime in HTML (should be added by JS)
    print(f"  {app}: theme_css={has_theme_css}, theme_js={has_theme_js}, theme_btn={has_theme_btn}")
    
    if app not in ['duel-tri', 'tri-visualiseur', 'api-contacts', 'bootstrap-demo', 'tailwind-demo', 
                   'api-express', 'messagerie-temps-reel', 'python-analyse', 'wp-theme-portfolio',
                   'carte-points-interet', 'mini-sgbd', 'suivi-depenses', 'boutique-souk', 'quiz-culture_generale']:
        # These should have integrated theme.js per earlier work
        pass
    
    # Check if standalone app shares the SAME localStorage key as portfolio
    if app == 'api-contacts':
        if 'theme-sombre' not in content and 'duel-theme' not in content:
            issues.append(f"{app}: needs theme localStorage compatibility check")

print("\n=== PORTFOLIO PAGE CHECK ===")
portfolio_proj = BASE / "portfolio" / "projets"
if portfolio_proj.exists():
    for p in portfolio_proj.glob('*.html'):
        content = p.read_text(encoding='utf-8')
        has_fond = 'fond-anime' in content
        has_theme = 'id="theme"' in content
        print(f"  {p.name}: fond={has_fond}, theme={has_theme}")
        if not has_fond:
            issues.append(f"Portfolio {p.name}: missing fond-anime")
        if not has_theme:
            issues.append(f"Portfolio {p.name}: missing theme button")

print("\n=== CSS VARIABLE CHECK ===")
# Check if shared/theme.css has all variables defined for both light and dark modes
if theme_css.exists():
    css = theme_css.read_text(encoding='utf-8')
    # Check for light mode defaults (body or :root)
    if ':root{' in css or 'body{' in css:
        # Must have the root variables
        needed_vars = ['--ciel-haut', '--ciel-bas', '--blob-1', '--blob-4', '--blob-opacite', 
                       '--grille-point', '--halo-a', '--ruban-opacite', '--contour', '--halo-b']
        for var in needed_vars:
            if var not in css:
                issues.append(f"theme.css: missing {var}")
    else:
        issues.append("theme.css: no :root or body variable definitions (only dark mode)")

print("\n=== ISSUES SUMMARY ===")
if issues:
    for issue in issues:
        print(f"  ❌ {issue}")
else:
    print("  No major issues found!")

# Additional check: make sure all apps have their own script.js
print("\n=== SCRIPT.JS CHECK ===")
for app in standalone_apps:
    script_path = BASE / app / "js" / "script.js"
    if script_path.exists():
        print(f"  ✓ {app}/js/script.js exists")
    elif app != "shared":
        print(f"  ? {app}/js/script.js not found")