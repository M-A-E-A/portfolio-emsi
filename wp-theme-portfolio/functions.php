<?php
/**
 * Fonctions du thème Portfolio Theme.
 */

if (!defined('ABSPATH')) {
    exit;
}

// Enregistrement des menus et de la barre latérale
function pt_setup() {
    add_theme_support('title-tag');
    add_theme_support('post-thumbnails');
    add_theme_support('html5', array('search-form', 'comment-form', 'comment-list', 'gallery', 'caption'));
    add_theme_support('custom-logo');

    register_nav_menus(array(
        'primary' => __('Menu principal', 'portfolio-theme'),
    ));

    register_sidebar(array(
        'name'          => __('Barre latérale', 'portfolio-theme'),
        'id'            => 'sidebar-1',
        'description'   => __('Widgets de la barre latérale.', 'portfolio-theme'),
        'before_widget' => '<section id="%1$s" class="widget %2$s">',
        'after_widget'  => '</section>',
        'before_title'  => '<h2 class="widget-title">',
        'after_title'   => '</h2>',
    ));
}
add_action('after_setup_theme', 'pt_setup');

// Chargement des feuilles de style et des scripts
function pt_scripts() {
    wp_enqueue_style('pt-style', get_stylesheet_uri(), array(), '1.0.0');
    wp_enqueue_style('pt-fonts', 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap', array(), null);
}
add_action('wp_enqueue_scripts', 'pt_scripts');

// Extrait personnalisé : 30 mots
function pt_excerpt_length($length) {
    return 30;
}
add_filter('excerpt_length', 'pt_excerpt_length');

// Texte du lien « lire la suite »
function pt_excerpt_more($more) {
    return '… <a class="read-more" href="' . esc_url(get_permalink()) . '">Lire la suite</a>';
}
add_filter('excerpt_more', 'pt_excerpt_more');