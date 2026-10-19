import os, re
root = r"C:\Users\Hp\Desktop\EMSI\DEV- NUMERIQUE\PROJECTS"
map_fond = {
  "api-contacts":"grille","bootstrap-demo":"plat","boutique-souk":"soie",
  "carte-points-interet":"contours","duel-tri":"aurore","messagerie-temps-reel":"ruban",
  "mini-sgbd":"grille","quiz-culture-generale":"ruban","suivi-depenses":"plat",
  "tailwind-demo":"ruban","tri-visualiseur":"contours"
}
for p, fond in map_fond.items():
    path = os.path.join(root, p, "index.html")
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()
    html = html.replace('<link rel="stylesheet" href="../shared/theme.css">', '<link rel="stylesheet" href="../shared/theme.css">\n  <link rel="stylesheet" href="../shared/themes.css">')
    html = re.sub(r'<body[^>]*>', f'<body data-projet="{p}" data-fond="{fond}">', html)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
    print("Patched", p, "fond=", fond)
