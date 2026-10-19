<?php
/**
 * Template d'un article seul.
 */
get_header();
?>

<?php while (have_posts()) : the_post(); ?>
    <article id="post-<?php the_ID(); ?>" <?php post_class('entry'); ?>>
        <header class="entry-header">
            <h1 class="entry-title"><?php the_title(); ?></h1>
            <p class="entry-meta">
                <?php echo esc_html(get_the_date()); ?> —
                <?php the_author(); ?> —
                <?php the_category(', '); ?>
            </p>
        </header>
        <div class="entry-content">
            <?php the_content(); ?>
        </div>
        <?php
        if (comments_open() || get_comments_number()) {
            comments_template();
        }
        ?>
    </article>

    <nav class="post-navigation">
        <?php
        the_post_navigation(array(
            'prev_text' => __('← Article précédent', 'portfolio-theme'),
            'next_text' => __('Article suivant →', 'portfolio-theme'),
        ));
        ?>
    </nav>
<?php endwhile; ?>

<?php get_footer(); ?>