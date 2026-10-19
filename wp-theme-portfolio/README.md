# Thème WordPress « Portfolio »

Preuve concrète pour la compétence **WordPress** affichée dans le portfolio.
Un thème WordPress minimal mais complet : en-tête, boucle, article unique, page,
archive, barre latérale, 404, avec menus et widgets enregistrés.

## Installation

1. Copier le dossier `wp-theme-portfolio/` dans `wp-content/themes/`
2. Activer le thème dans l'administration WordPress
3. Créer un menu et l'assigner à « Menu principal »
4. Ajouter des widgets dans la barre latérale

## Fichiers

| Fichier | Rôle |
|---------|------|
| `style.css` | en-tête du thème (métadonnées) + styles |
| `functions.php` | support du thème, menus, barre latérale, scripts |
| `header.php` | doctype, head, en-tête, navigation |
| `footer.php` | barre latérale, pied de page, wp_footer |
| `index.php` | boucle principale avec pagination |
| `single.php` | article seul avec commentaires et navigation |
| `page.php` | page statique |
| `archive.php` | archives par catégorie, tag, auteur, date |
| `404.php` | page non trouvée |

## Ce que ça démontre

- Structure d'un thème WordPress (template hierarchy)
- `functions.php` : `add_theme_support`, `register_nav_menus`, `register_sidebar`, `wp_enqueue_style`
- Boucle WordPress (`have_posts`, `the_post`, `the_title`, `the_content`)
- Pagination (`the_posts_pagination`, `the_post_navigation`)
- Internationalisation (`__`, `esc_html_e`, `esc_attr_e`)
- Sécurité : `esc_url`, `esc_html`, `esc_attr`

Les données viennent de WordPress : le thème ne contient pas de contenu, il
affiche ce que l'administration fournit. C'est volontaire — un thème est une
couche de présentation, pas un site.