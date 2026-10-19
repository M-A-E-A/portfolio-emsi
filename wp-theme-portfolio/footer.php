</main><!-- #content -->

<?php if (is_active_sidebar('sidebar-1')) : ?>
    <aside class="sidebar" aria-label="<?php esc_attr_e('Barre latérale', 'portfolio-theme'); ?>">
        <?php dynamic_sidebar('sidebar-1'); ?>
    </aside>
<?php endif; ?>

</div><!-- .site-main -->

<footer class="site-footer">
    <p>
        &copy; <?php echo esc_html(date_i18n('Y')); ?>
        <?php bloginfo('name'); ?>
        — <?php echo esc_html__('Fait avec WordPress et ce thème.', 'portfolio-theme'); ?>
    </p>
</footer>

<?php wp_footer(); ?>
</body>
</html>