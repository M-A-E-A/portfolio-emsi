import os, re
root = r"C:\Users\Hp\Desktop\EMSI\DEV- NUMERIQUE\PROJECTS"
projets = ["api-contacts","bootstrap-demo","boutique-souk","carte-points-interet","duel-tri",
           "messagerie-temps-reel","mini-sgbd","quiz-culture-generale","suivi-depenses",
           "tailwind-demo","tri-visualiseur"]
for p in projets:
    path = os.path.join(root, p, "index.html")
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()
    # retire la ligne themes.css où elle est
    html = html.replace('  <link rel="stylesheet" href="../shared/themes.css">\n', '')
    html = html.replace('  <link rel="stylesheet" href="../shared/themes.css">', '')
    # la réinsère juste avant la fermeture de </head> : elle passe en dernier
    html = html.replace('</head>', '  <link rel="stylesheet" href="../shared/themes.css">\n</head>')
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
    print("reordered", p)
