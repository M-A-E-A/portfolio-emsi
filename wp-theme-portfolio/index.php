<?php
/**
 * Template principal.
 */
get_header();
?>

<?php if (have_posts()) : ?>
    <?php while (have_posts()) : the_post(); ?>
        <article id="post-<?php the_ID(); ?>" <?php post_class('entry'); ?>>
            <header class="entry-header">
                <h2 class="entry-title">
                    <a href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
                </h2>
                <p class="entry-meta">
                    <?php echo esc_html(get_the_date()); ?> —
                    <?php the_author(); ?>
                </p>
            </header>
            <div class="entry-content">
                <?php the_excerpt(); ?>
            </div>
        </article>
    <?php endwhile; ?>

    <div class="pagination">
        <?php
        the_posts_pagination(array(
            'mid_size'  => 2,
            'prev_text' => __('Précédent', 'portfolio-theme'),
            'next_text' => __('Suivant', 'portfolio-theme'),
        ));
        ?>
    </div>
<?php else : ?>
    <p><?php esc_html_e('Aucun article trouvé.', 'portfolio-theme'); ?></p>
<?php endif; ?>

<?php get_footer(); ?>