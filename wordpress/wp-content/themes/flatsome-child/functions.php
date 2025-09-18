<?php
// Child theme custom functions (optimize without breaking existing behavior)

// Load textdomain (future translation support; safe if directory missing)
add_action('after_setup_theme', function(){
    load_child_theme_textdomain('flatsome-child', get_stylesheet_directory() . '/languages');
});

// Enqueue parent and child theme styles
function flatsome_child_theme_styles() {
    // Parent style
    wp_enqueue_style( 'flatsome-parent-style', get_template_directory_uri() . '/style.css', [], flatsome()->version() );

    // Version child style by file modification time to avoid cache issues after edits
    $child_style_path = get_stylesheet_directory() . '/style.css';
    $child_ver = file_exists($child_style_path) ? filemtime($child_style_path) : '1.0';
    wp_enqueue_style( 'flatsome-child-style', get_stylesheet_directory_uri() . '/style.css', array('flatsome-parent-style'), $child_ver );
}
add_action( 'wp_enqueue_scripts', 'flatsome_child_theme_styles' );

// "Add to Cart" buton metnini her yerde "Shop Now" yap
function flatsome_child_shop_now_text_single( $text ) {
    return __( 'Shop Now', 'flatsome-child' );
}
function flatsome_child_shop_now_text_loop( $text, $product ) {
    return __( 'Shop Now', 'flatsome-child' );
}
add_filter( 'woocommerce_product_single_add_to_cart_text', 'flatsome_child_shop_now_text_single', 10, 1 );
add_filter( 'woocommerce_product_add_to_cart_text', 'flatsome_child_shop_now_text_loop', 10, 2 );

// ÖNEMLİ: Ürünleri zorla "sold individually" yapmayı kaldırdık. (Aksi halde ürün sepetteyse tekrar eklenmez ve buton boşa döner.)
// Eğer sadece quantity alanını gizlemek istiyorsak CSS yeterli; mantığı değiştirmeye gerek yok.
// add_filter( 'woocommerce_is_sold_individually', ... ) kaldırıldı.

// (Removed inline CSS injection — all related rules already in style.css to reduce duplication)

// Mini cart'ta da quantity seçiciyi kaldır
add_filter( 'woocommerce_widget_cart_item_quantity', 'remove_mini_cart_quantity', 10, 3 );
function remove_mini_cart_quantity( $quantity, $cart_item, $cart_item_key ) {
    return '';
}

// Yukarıdaki filtre tüm ürün tiplerini kapsadığı için ekstra değişiklik gerekmiyor.

// Tekil ürünlerde AJAX Add to Cart (hafif sürüm)
function flatsome_child_enqueue_scripts() {
    $script_path = get_stylesheet_directory() . '/js/single-atc.js';
    $ver = file_exists($script_path) ? filemtime($script_path) : '1.0.0';
    wp_enqueue_script(
        'flatsome-child-single-atc',
        get_stylesheet_directory_uri() . '/js/single-atc.js',
        array( 'jquery', 'wc-add-to-cart' ),
        $ver,
        true
    );
    wp_localize_script( 'flatsome-child-single-atc', 'FLATSOME_CHILD_ATC', array(
        'ajax_url'   => admin_url('admin-ajax.php'),
        'wc_ajax_url'=> ( function_exists('wc') && method_exists( wc(), 'ajax_url' ) ) ? wc()->ajax_url() : site_url( '/?wc-ajax=%%endpoint%%' ),
        'added_text' => __( 'Added', 'flatsome-child' ),
        'adding_text'=> __( 'Adding…', 'flatsome-child' ),
    ) );
}
add_action( 'wp_enqueue_scripts', 'flatsome_child_enqueue_scripts', 30 );

// Sepet sayfasında quantity değişince otomatik güncelleme yapan scripti koşullu enqueue ediyoruz.
add_action( 'wp_enqueue_scripts', function(){
    if( function_exists('is_cart') && is_cart() ){
        $script_path = get_stylesheet_directory() . '/js/cart-auto-update.js';
        $ver = file_exists($script_path) ? filemtime($script_path) : '1.0.0';
        wp_enqueue_script(
            'flatsome-child-cart-auto-update',
            get_stylesheet_directory_uri() . '/js/cart-auto-update.js',
            array('jquery'),
            $ver,
            true
        );
    }
}, 40 );

// Grouped products için de "Shop Now" text
add_filter( 'woocommerce_grouped_product_list_column_quantity', 'remove_grouped_quantity_field', 10, 2 );
function remove_grouped_quantity_field( $quantity_html, $product ) {
    return '';
}

// AJAX: Cart quantity update (no full page reload)
add_action('wp_ajax_flatsome_child_update_cart_item', 'flatsome_child_update_cart_item');
add_action('wp_ajax_nopriv_flatsome_child_update_cart_item', 'flatsome_child_update_cart_item');
function flatsome_child_update_cart_item(){
    if( ! isset($_POST['nonce']) || ! wp_verify_nonce( $_POST['nonce'], 'flatsome_child_cart' ) ){
        wp_send_json_error(['message' => 'Invalid nonce']);
    }
    if( empty($_POST['cart_item_key']) || ! isset($_POST['quantity']) ){
        wp_send_json_error(['message' => 'Missing params']);
    }
    $cart_item_key = sanitize_text_field( wp_unslash( $_POST['cart_item_key'] ) );
    $quantity      = wc_stock_amount( wp_unslash( $_POST['quantity'] ) );

    if( $quantity < 1 ) $quantity = 1; // enforce min quantity 1

    $cart = WC()->cart;
    if( ! $cart || ! $cart->get_cart_item( $cart_item_key ) ){
        wp_send_json_error(['message' => 'Cart item not found']);
    }

    $updated = $cart->set_quantity( $cart_item_key, $quantity, true ); // triggers recalculation
    if( false === $updated ){
        wp_send_json_error(['message' => 'Could not update quantity']);
    }
    $cart->calculate_totals();

    ob_start();
    // Subtotal cell (single row) yeniden üretmek yerine tüm row'u istemiyoruz; sadece bu ürünün subtotal değeri.
    $item = $cart->get_cart_item( $cart_item_key );
    $product = $item['data'];
    $subtotal_html = apply_filters( 'woocommerce_cart_item_subtotal', $cart->get_product_subtotal( $product, $item['quantity'] ), $item, $cart_item_key );

    // Totals paneli
    wc_get_template( 'cart/cart-totals.php' );
    $totals_html = ob_get_clean();

    // Mini cart fragmentleri de güncellensin diye WooCommerce’in standart mekanizmasını kullanalım.
    $fragments = apply_filters( 'woocommerce_add_to_cart_fragments', [] );

    wp_send_json_success([
        'cart_hash'     => $cart->get_cart_hash(),
        'quantity'      => $quantity,
        'subtotal_html' => $subtotal_html,
        'totals_html'   => $totals_html,
        'fragments'     => $fragments,
    ]);
}

// Enqueue: cart sayfası için AJAX config
add_action( 'wp_enqueue_scripts', function(){
    if( function_exists('is_cart') && is_cart() ){
        $nonce = wp_create_nonce('flatsome_child_cart');
        wp_localize_script('flatsome-child-cart-auto-update', 'FLATSOME_CHILD_CART', [
            'ajax_url' => admin_url('admin-ajax.php'),
            'nonce'    => $nonce,
            'i18n'     => [
                'updating' => __('Updating…','flatsome-child'),
                'updated'  => __('Cart updated','flatsome-child'),
                'error'    => __('Update failed','flatsome-child')
            ]
        ]);
    }
}, 50 );

// Artık form inputlarını zorla enjekte etmiyoruz; orijinal template kullanılmalı.
