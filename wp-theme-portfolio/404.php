<?php
/**
 * Template 404.
 */
get_header();
?>

<div class="not-found">
    <h1>404</h1>
    <p><?php esc_html_e('Cette page n\'existe pas.', 'portfolio-theme'); ?></p>
    <p><a href="<?php echo esc_url(home_url('/')); ?>"><?php esc_html_e('Retour à l\'accueil', 'portfolio-theme'); ?></a></p>
    <?php get_search_form(); ?>
</div>

<?php get_footer(); ?>