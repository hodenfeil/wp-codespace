(function($){
  function log(){ /* production: keep silent or enable if needed */ }
  function getAjaxUrl(){
    if(typeof wc_add_to_cart_params !== 'undefined' && wc_add_to_cart_params.wc_ajax_url){
      return wc_add_to_cart_params.wc_ajax_url.replace('%%endpoint%%','add_to_cart');
    }
    if(window.FLATSOME_CHILD_ATC && FLATSOME_CHILD_ATC.wc_ajax_url){
      return FLATSOME_CHILD_ATC.wc_ajax_url.replace('%%endpoint%%','add_to_cart');
    }
    return (window.location.origin + '/?wc-ajax=add_to_cart');
  }
  $(document).on('click', '.single-product form.cart .single_add_to_cart_button', function(e){
    var $btn = $(this);
    var $form = $btn.closest('form.cart');
    if(!$form.length) return; // fallback

    // Eğer variable veya grouped ise varsayılan davranışa dokunma
    if($form.find('.variations select').length) return; // variable products normal akış
    if($form.hasClass('grouped_form')) return; // grouped

    e.preventDefault();

    // Quantity input gizlenmiş olabilir; yoksa 1
    if($form.find('input[name="quantity"]').length === 0){
      $form.append('<input type="hidden" name="quantity" value="1" />');
    }
    var productId = $form.find('input[name="add-to-cart"]').val() || $btn.val();
    if(!productId){
      // Body class fallback
      var m = document.body.className.match(/postid-(\d+)/); if(m) productId = m[1];
      if(!productId) { log('No product id'); return; }
      $form.append('<input type="hidden" name="add-to-cart" value="'+productId+'" />');
    }

    var data = $form.serialize();
    // Bazı temalarda add-to-cart yerine product_id beklenebilir; ikisini de gönder.
    if(data.indexOf('product_id=') === -1){
      data += '&product_id=' + encodeURIComponent(productId);
    }
    var url = getAjaxUrl();

  if($btn.data('atc-busy')) return; // guard double-click
  $btn.data('atc-busy', true);
  $btn.addClass('loading').prop('disabled', true).attr('aria-busy','true');
    var originalText = $btn.text();
    $btn.data('orig', originalText).text( FLATSOME_CHILD_ATC.adding_text || 'Adding…');

    $.ajax({
      type: 'POST',
      url: url,
      data: data,
      success: function(resp){
        try {
          if(window.console){ console.log('[ATC] response', resp); }
          if(!resp || resp.error || (resp && resp.fragments === undefined)){
            // WooCommerce error veya beklenmeyen çıktı -> fallback normal submit
            if(window.console){ console.warn('[ATC] AJAX fallback normal submit'); }
            reset();
            // Normal form submitine dön (sayfa yeniler)
            $form.off('submit.atcFallback').on('submit.atcFallback', function(){ return true; });
            $form.trigger('submit');
            return;
          }
          if(resp && resp.fragments){
            $.each(resp.fragments, function(sel, html){ $(sel).replaceWith(html); });
            $(document.body).trigger('wc_fragments_loaded');
          }
          $(document.body).trigger('added_to_cart', [resp.fragments || {}, resp.cart_hash || '', $btn]);
          $btn.removeClass('loading').addClass('added').attr('aria-busy','false').text( FLATSOME_CHILD_ATC.added_text || 'Added');
          setTimeout(function(){
            $btn.prop('disabled', false).text(originalText).removeClass('added').data('atc-busy', false);
          }, 2500);
        } catch(e){ log(e); reset(); }
      },
      error: function(){ reset(); },
      complete: function(){ /* nothing */ }
    });

    function reset(){
      $btn.removeClass('loading').prop('disabled', false).attr('aria-busy','false').text(originalText).data('atc-busy', false);
    }
  });
})(jQuery);
