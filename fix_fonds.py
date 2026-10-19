import os, re
root = r"C:\Users\Hp\Desktop\EMSI\DEV- NUMERIQUE\PROJECTS"
# 6 variantes pour 11 projets : on garde au minimum 1 doublon par variante,
# chaque paire étant choisie pour la cohérence de son « vibe ».
map_fond = {
  "api-contacts":"grille",         # données tabulaires
  "mini-sgbd":"grille",            # moteur SQL, tables
  "bootstrap-demo":"plat",         # panneaux de tableau de bord
  "suivi-depenses":"plat",         # graphiques sobres
  "boutique-souk":"soie",          # artisanat, nappes souples
  "quiz-culture-generale":"soie",  # ambiance chaude du quiz
  "carte-points-interet":"contours",  # topographie
  "tri-visualiseur":"contours",    # lignes de parcours
  "duel-tri":"aurore",             # blobs qui s'affrontent
  "tailwind-demo":"aurore",        # dégradés modernes
  "messagerie-temps-reel":"ruban", # messages qui coulent
}
for p, fond in map_fond.items():
    path = os.path.join(root, p, "index.html")
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()
    html = re.sub(r'data-fond="[a-z]+"', f'data-fond="{fond}"', html)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
    print(f"{p:<26} fond={fond}")
