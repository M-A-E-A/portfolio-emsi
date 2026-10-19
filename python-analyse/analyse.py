#!/usr/bin/env python3
"""Analyse rapide d'un fichier CSV : statistiques par colonne et regroupements.

Usage :
    python analyse.py donnees.csv
    python analyse.py donnees.csv --groupe ville
    python analyse.py donnees.csv --colonne moyenne --groupe ville

Aucune dépendance externe : uniquement la bibliothèque standard.
"""

import argparse
import csv
import statistics
import sys
from collections import defaultdict


def lire_csv(chemin):
    """Lit le CSV et renvoie (en-têtes, lignes sous forme de dict)."""
    with open(chemin, newline="", encoding="utf-8-sig") as f:
        lecteur = csv.DictReader(f)
        if lecteur.fieldnames is None:
            raise ValueError("fichier vide ou sans en-tête")
        lignes = [ligne for ligne in lecteur]
    return lecteur.fieldnames, lignes


def est_nombre(valeur):
    """Dit si la valeur peut être lue comme un nombre."""
    try:
        float(valeur)
        return True
    except (ValueError, TypeError):
        return False


def stats_colonne(valeurs):
    """Calcule les statistiques d'une colonne (numérique ou textuelle)."""
    propres = [v for v in valeurs if v not in (None, "")]
    if not propres:
        return {"type": "vide", "nombre": 0}

    if all(est_nombre(v) for v in propres):
        nombres = [float(v) for v in propres]
        return {
            "type": "numérique",
            "nombre": len(nombres),
            "min": min(nombres),
            "max": max(nombres),
            "moyenne": statistics.fmean(nombres),
            "mediane": statistics.median(nombres),
            "ecart_type": statistics.pstdev(nombres) if len(nombres) > 1 else 0.0,
        }

    distincts = sorted(set(propres))
    return {
        "type": "texte",
        "nombre": len(propres),
        "distincts": len(distincts),
        "valeurs": distincts[:8],
    }


def regrouper(lignes, colonne_groupe, colonne_valeur):
    """Regroupe les lignes par une colonne et calcule la moyenne d'une autre."""
    groupes = defaultdict(list)
    for ligne in lignes:
        cle = ligne.get(colonne_groupe, "")
        valeur = ligne.get(colonne_valeur, "")
        if est_nombre(valeur):
            groupes[cle].append(float(valeur))

    resultat = []
    for cle, valeurs in sorted(groupes.items()):
        if valeurs:
            resultat.append((cle, len(valeurs), statistics.fmean(valeurs)))
    return resultat


def afficher_rapport(en_tetes, lignes):
    """Affiche les statistiques de chaque colonne."""
    print(f"\n{len(lignes)} ligne(s) lue(s), {len(en_tetes)} colonne(s).\n")
    print("-" * 60)
    for colonne in en_tetes:
        valeurs = [ligne.get(colonne, "") for ligne in lignes]
        s = stats_colonne(valeurs)
        if s["type"] == "vide":
            print(f"{colonne:20}  (vide)")
        elif s["type"] == "numérique":
            print(f"{colonne:20}  numérique   n={s['nombre']}")
            print(f"{'':20}  min={s['min']:.2f}  max={s['max']:.2f}  "
                  f"moyenne={s['moyenne']:.2f}  médiane={s['mediane']:.2f}  "
                  f"écart-type={s['ecart_type']:.2f}")
        else:
            print(f"{colonne:20}  texte      n={s['nombre']}  distincts={s['distincts']}")
            print(f"{'':20}  {', '.join(s['valeurs'])}")
    print("-" * 60)


def main():
    parseur = argparse.ArgumentParser(description="Analyse rapide d'un fichier CSV.")
    parseur.add_argument("fichier", help="chemin du fichier CSV")
    parseur.add_argument("--groupe", help="colonne de regroupement")
    parseur.add_argument("--colonne", help="colonne numérique à moyenner par groupe")
    args = parseur.parse_args()

    try:
        en_tetes, lignes = lire_csv(args.fichier)
    except (FileNotFoundError, ValueError) as erreur:
        print(f"erreur : {erreur}", file=sys.stderr)
        sys.exit(1)

    afficher_rapport(en_tetes, lignes)

    if args.groupe:
        colonne_valeur = args.colonne or next(
            (c for c in en_tetes if c != args.groupe
             and all(est_nombre(l.get(c, "")) for l in lignes if l.get(c, "") not in ("", None))),
            None,
        )
        if colonne_valeur is None:
            print("\naucune colonne numérique trouvée pour le regroupement.", file=sys.stderr)
            sys.exit(1)
        print(f"\nMoyenne de « {colonne_valeur} » par « {args.groupe} » :\n")
        for cle, n, moyenne in regrouper(lignes, args.groupe, colonne_valeur):
            print(f"  {cle:20}  n={n:3}  moyenne={moyenne:.2f}")
        print()


if __name__ == "__main__":
    main()