// B143: presentation only; never writes learning records or storage keys.
(() => {
  const more = document.querySelector('.header-more');
  document.addEventListener('click', event => {
    if (more && (!more.contains(event.target) || event.target.closest('button'))) more.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && more?.open) {
      more.open = false;
      more.querySelector('summary').focus();
    }
  });
  const main = document.querySelector('.workspace');
  const syncNavigation = () => document.querySelectorAll('[data-module-target]').forEach(button => {
    if (button.dataset.moduleTarget === main?.dataset.activeModule) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (main) new MutationObserver(syncNavigation).observe(main, {attributes:true, attributeFilter:['data-active-module']});
  syncNavigation();
})();
