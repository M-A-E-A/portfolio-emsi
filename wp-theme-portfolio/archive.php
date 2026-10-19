<?php
/**
 * Template d'archive (catégorie, tag, auteur, date).
 */
get_header();
?>

<header class="archive-header">
    <h1 class="archive-title">
        <?php
        if (is_category()) {
            printf(esc_html__('Catégorie : %s', 'portfolio-theme'), single_cat_title('', false));
        } elseif (is_tag()) {
            printf(esc_html__('Étiquette : %s', 'portfolio-theme'), single_tag_title('', false));
        } elseif (is_author()) {
            printf(esc_html__('Auteur : %s', 'portfolio-theme'), get_the_author());
        } elseif (is_year()) {
            printf(esc_html__('Année : %s', 'portfolio-theme'), get_the_date('Y'));
        } else {
            esc_html_e('Archives', 'portfolio-theme');
        }
        ?>
    </h1>
</header>

<?php if (have_posts()) : ?>
    <?php while (have_posts()) : the_post(); ?>
        <article id="post-<?php the_ID(); ?>" <?php post_class('entry'); ?>>
            <header class="entry-header">
                <h2 class="entry-title">
                    <a href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
                </h2>
                <p class="entry-meta"><?php echo esc_html(get_the_date()); ?></p>
            </header>
            <div class="entry-content">
                <?php the_excerpt(); ?>
            </div>
        </article>
    <?php endwhile; ?>

    <div class="pagination">
        <?php the_posts_pagination(); ?>
    </div>
<?php else : ?>
    <p><?php esc_html_e('Aucun article trouvé.', 'portfolio-theme'); ?></p>
<?php endif; ?>

<?php get_footer(); ?>