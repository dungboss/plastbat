(() => {
  // Product forms (main-product + pbmac product sections) that add to cart via AJAX and open the cart drawer.
  const productFormSelector = 'form.pb-product-form, form.pbmac-form';

  const showError = (form, message) => {
    let error = form.querySelector('[data-pb-cart-error]');
    if (!error) {
      error = document.createElement('p');
      error.className = 'pb-cart-error';
      error.dataset.pbCartError = '';
      error.setAttribute('role', 'alert');
      form.append(error);
    }
    error.textContent = message;
  };

  document.addEventListener('submit', async (event) => {
    const form = event.target.closest(productFormSelector);
    // Respect section-level validators that already cancelled the submit (e.g. sold out, empty personalization).
    if (!form || event.defaultPrevented || form.dataset.pbCartSubmitting === 'true') return;

    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const drawer = document.querySelector('cart-drawer');
    if (!drawer || typeof drawer.renderContents !== 'function') {
      showError(form, 'Cart is unavailable. Please refresh the page and try again.');
      return;
    }

    const submitButtons = [...form.querySelectorAll('[type="submit"]')];
    const previousDisabledStates = submitButtons.map((button) => button.disabled);
    const error = form.querySelector('[data-pb-cart-error]');
    if (error) error.remove();

    form.dataset.pbCartSubmitting = 'true';
    submitButtons.forEach((button) => {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    });

    try {
      const formData = new FormData(form);
      formData.append('sections', drawer.getSectionsToRender().map((section) => section.id));
      formData.append('sections_url', window.location.pathname);

      const response = await fetch(window.routes?.cart_add_url || '/cart/add.js', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: formData
      });
      const cartState = await response.json();

      if (!response.ok || cartState.status) {
        throw new Error(cartState.description || cartState.message || 'Unable to add this item to your cart.');
      }

      let drawerHTML = cartState.sections?.['cart-drawer'];
      const hasDrawerMarkup = (html) => {
        if (!html) return false;
        return Boolean(
          new DOMParser().parseFromString(html, 'text/html').querySelector('#CartDrawer')
        );
      };

      // Shopify normally returns the freshly rendered drawer with cart/add.js.
      // Only make another request when that section is absent or malformed.
      if (!hasDrawerMarkup(drawerHTML)) {
        const drawerResponse = await fetch(`${window.routes?.cart_url || '/cart'}?section_id=cart-drawer`, {
          headers: { Accept: 'text/html' },
          cache: 'no-store'
        });

        if (!drawerResponse.ok) {
          throw new Error('Unable to refresh your cart. Please try again.');
        }

        drawerHTML = await drawerResponse.text();
      }

      if (!hasDrawerMarkup(drawerHTML)) {
        throw new Error('Unable to display your cart. Please refresh the page and try again.');
      }

      drawer.setActiveElement(event.submitter || document.activeElement);
      drawer.renderContents({
        ...cartState,
        sections: { 'cart-drawer': drawerHTML }
      });
    } catch (exception) {
      console.error('Unable to add item to cart', exception);
      showError(form, exception.message || 'Unable to add this item to your cart. Please try again.');
    } finally {
      delete form.dataset.pbCartSubmitting;
      submitButtons.forEach((button, index) => {
        button.disabled = previousDisabledStates[index];
        button.removeAttribute('aria-busy');
      });
    }
  });
})();
