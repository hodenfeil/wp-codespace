(function($){
  var $doc = $(document);
  if(typeof FLATSOME_CHILD_CART === 'undefined') return; // config yok
  // Body'ye feature flag class ekle (CSS koşullu işlemler için)
  document.body.classList.add('js-cart-auto-update-active');

  // Status container (once only)
  var statusId = 'cart-inline-status';
  var hideTimer = null;
  function ensureStatus(){
    var el = document.getElementById(statusId);
    if(!el){
      el = document.createElement('div');
      el.id = statusId;
      el.className = 'cart-inline-status';
      el.setAttribute('role','status');
      el.setAttribute('aria-live','polite');
      var anchor = document.getElementById('cart-status-anchor');
      if(anchor){
        anchor.after(el);
      } else {
  var fallback = document.querySelector('.cart-grid-side') || document.querySelector('.woocommerce-cart-form');
        if(fallback){ fallback.appendChild(el); }
      }
    }
    return el;
  }
  function setStatus(msg, type){
    var el = ensureStatus();
    if(hideTimer){ clearTimeout(hideTimer); hideTimer = null; }
    if(!msg){
      el.classList.add('is-hidden');
      el.textContent='';
      el.dataset.type='';
      return;
    }
    el.textContent = msg;
    el.dataset.type = type || '';
    el.classList.remove('is-hidden');
    if(type === 'success'){
      hideTimer = setTimeout(function(){
        el.classList.add('is-fading');
        setTimeout(function(){ setStatus('', ''); el.classList.remove('is-fading'); }, 350);
      }, 3000);
    }
  }

  function refreshMinusStates(context){
    var $scope = context ? $(context) : $('.woocommerce-cart-form');
    $scope.find('.quantity').each(function(){
      var $qWrap = $(this);
      var $input = $qWrap.find('.qty');
      var $minus = $qWrap.find('.minus');
      if(!$input.length || !$minus.length) return;
      var minAttr = parseFloat($input.attr('min'));
      var min = isNaN(minAttr) ? 1 : minAttr;
      var current = parseFloat($input.val());
      if(isNaN(current)) current = min;
      if(current <= min){
        $minus
          .prop('disabled', true)
          .addClass('is-disabled')
          .attr({
            'aria-disabled':'true',
            'title':'Minimum 1',
            'aria-label':'Minimum 1'
          });
      } else {
        $minus
          .prop('disabled', false)
          .removeClass('is-disabled')
          .removeAttr('aria-disabled')
          .removeAttr('title')
          .removeAttr('aria-label');
      }
    });
  }

  function debounce(fn, wait){
    var t; return function(){ var ctx=this, args=arguments; clearTimeout(t); t=setTimeout(function(){ fn.apply(ctx,args); }, wait); };
  }

  function updateRow($qty){
    var $row = $qty.closest('tr[data-cart-item-key]');
    if(!$row.length) return;
    var key = $row.data('cart-item-key');
    var val = $qty.val();
    $row.addClass('updating');
    $qty.prop('disabled', true); // double click guard

  setStatus(FLATSOME_CHILD_CART.i18n.updating || 'Updating…','loading');
  $.ajax({
      url: FLATSOME_CHILD_CART.ajax_url,
      type: 'POST',
      dataType: 'json',
      data: {
        action: 'flatsome_child_update_cart_item',
        cart_item_key: key,
        quantity: val,
        nonce: FLATSOME_CHILD_CART.nonce
      },
      success: function(resp){
        if(!resp || !resp.success){ handleError(resp && resp.data && resp.data.message); return; }
        var d = resp.data;
        // Subtotal hücresini güncelle
        $row.find('.product-subtotal').html(d.subtotal_html);
        // Cart totals panelini güncelle
        var $collaterals = $('.cart-collaterals');
        if($collaterals.length){
          $collaterals.html($(d.totals_html).find('.cart_totals').parent().html() || d.totals_html);
        }
        // Woo fragments (mini cart vs) tetikle
        if(d.fragments){
          $.each(d.fragments, function(sel, html){
            $(sel).replaceWith(html);
          });
          $(document.body).trigger('wc_fragments_loaded');
        }
        $(document.body).trigger('updated_wc_div');
        setStatus(FLATSOME_CHILD_CART.i18n.updated || 'Updated','success');
      },
      error: function(){ handleError('XHR'); },
      complete: function(){
        $row.removeClass('updating');
        $qty.prop('disabled', false);
        // AJAX sonrası minus state tazele
        refreshMinusStates($qty.closest('.quantity'));
      }
    });
  }

  function handleError(msg){
    console.warn('[Cart AJAX] failed', msg);
    var notice = FLATSOME_CHILD_CART.i18n.error || 'Error';
    setStatus(notice,'error');
    if($('.woocommerce-notices-wrapper').length){
      $('.woocommerce-notices-wrapper').append('<div class="woocommerce-error" role="alert">'+notice+'</div>');
    }
  }

  var debounced = debounce(function($q){ updateRow($q); }, 400);

  // Qty change
  $doc.on('change', '.woocommerce-cart-form .qty', function(){
    debounced($(this));
    refreshMinusStates($(this).closest('.quantity'));
  });

  // Anlık yazımda minus'un aktif/pasif durumunu güncelle (AJAX tetikleme yok)
  $doc.on('input keyup', '.woocommerce-cart-form .qty', function(){
    refreshMinusStates($(this).closest('.quantity'));
  });

  // Plus/minus (tema sağlıyorsa) -> sadece değeri değiştir, change tetiklesin
  // Tema zaten plus/minus ile değeri değiştiriyorsa çift artışı önlemek için
  // biz ekstra math yapmayacağız. Sadece min clamp ve change event garanti.
  $doc.on('click', '.woocommerce-cart-form .plus, .woocommerce-cart-form .minus', function(){
    var $btn = $(this), $qty = $btn.closest('.quantity').find('.qty');
    if(!$qty.length) return;
    if($btn.hasClass('minus') && $btn.is(':disabled')){ return; }
    setTimeout(function(){
      var minAttr = parseFloat($qty.attr('min'));
      var min = isNaN(minAttr) ? 1 : minAttr;
      var val = parseFloat($qty.val());
      if(isNaN(val) || val < min){
        $qty.val(min);
      }
      $qty.trigger('change');
      refreshMinusStates($qty.closest('.quantity'));
    }, 0); // önce tema kendi artırmayı yapsın
  });

  // Enter tuşu -> anında debounce iptal edip direkt update
  $doc.on('keyup', '.woocommerce-cart-form .qty', function(e){ if(e.key === 'Enter'){ updateRow($(this)); } });

  // İlk yükleme
  $(function(){
    refreshMinusStates();
    // MutationObserver: qty value attribute değişir (tema scriptleri setAttribute kullanabilir) ise güncelle
    if(window.MutationObserver){
      var observer = new MutationObserver(function(mutations){
        var needs = false;
        mutations.forEach(function(m){ if(m.type === 'attributes' && m.attributeName === 'value') needs = true; });
        if(needs){ refreshMinusStates(); }
      });
      $('.woocommerce-cart-form .qty').each(function(){
        observer.observe(this, { attributes: true, attributeFilter: ['value'] });
      });
      // Yeni satırlar eklenirse (örn. fragment replace) yeniden bağla
      $(document.body).on('updated_wc_div wc_fragments_loaded', function(){
        $('.woocommerce-cart-form .qty').each(function(){
          observer.observe(this, { attributes: true, attributeFilter: ['value'] });
        });
        refreshMinusStates();
      });
    } else {
      // Eski tarayıcı fallback: hafif interval (performans düşük etki)
      var lastSnapshot = '';
      setInterval(function(){
        var snap = $('.woocommerce-cart-form .qty').map(function(){ return this.value; }).get().join('|');
        if(snap !== lastSnapshot){
          lastSnapshot = snap;
          refreshMinusStates();
        }
      }, 600);
    }
  });

})(jQuery);