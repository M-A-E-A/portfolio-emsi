# Analyse CSV — Python

Preuve concrète pour la compétence **Python** affichée dans le portfolio.
Un petit outil en ligne de commande qui lit un fichier CSV et produit des
statistiques par colonne, avec regroupement optionnel.

Aucune dépendance externe : uniquement la bibliothèque standard (`csv`,
`statistics`, `argparse`).

## Lancement

```bash
cd python-analyse
python analyse.py etudiants.csv
python analyse.py etudiants.csv --groupe ville
python analyse.py etudiants.csv --groupe ville --colonne moyenne
```

## Ce que ça démontre

- Lecture d'un CSV avec `csv.DictReader`, gestion de l'encodage (`utf-8-sig`)
- Détection automatique du type d'une colonne (numérique ou texte)
- Statistiques : min, max, moyenne, médiane, écart-type, distincts
- Regroupement et agrégation par une colonne
- Interface en ligne de commande avec `argparse`
- Gestion des erreurs et codes de sortie

## Exemple de sortie

```
8 ligne(s) lue(s), 5 colonne(s).

------------------------------------------------------------
nom                  texte      n=8  distincts=8
                     El ADNANI, Bennani, Alaoui, ...
ville                texte      n=8  distincts=4
                     Casablanca, Fès, Marrakech, Rabat
moyenne              numérique   n=8
                     min=10.50  max=17.80  moyenne=13.98  médiane=13.85  écart-type=2.25
------------------------------------------------------------
```