// Runs inside other sites' player frames (Fanoos Android and desktop apps) to remove ads.
// Add selectors for ads you still see; the rest needs no changes.
(() => {
  if (window.__fanoosAdClean) return;
  window.__fanoosAdClean = true;

  const adSelectors = [
    '.ad-overlay', '.video-ad-banner', '.advertisement',
    '.ads', '.ad', '.adsbox', '.ad-container', '.ad-banner', '.banner-ad', '.popup-ad', '.pop-ad',
    '#ad', '#ads', '#ad-container', '#overlay-ad', '.overlay-ad', '.preroll', '.pre-roll',
    'ins.adsbygoogle', 'div[id^="google_ads"]', 'iframe[id^="google_ads"]',
    'a[href*="//ad."]', 'a[href*="/aff_c?"]', '[data-ad]', '[data-ad-slot]',
  ];
  const selector = adSelectors.join(',');

  // Pop-up and pop-under ads.
  try { window.open = () => null; } catch (e) { /* read-only on some pages */ }

  // Invisible layer over the whole player that opens an ad on the first click.
  function isClickCatcher(el) {
    if (!(el instanceof HTMLElement) || !/^(A|DIV|SPAN)$/.test(el.tagName)) return false;
    const s = getComputedStyle(el);
    if ((s.position !== 'fixed' && s.position !== 'absolute') || (parseInt(s.zIndex, 10) || 0) < 1000) return false;
    const r = el.getBoundingClientRect();
    if (r.width < innerWidth * 0.8 || r.height < innerHeight * 0.8) return false;
    return !el.querySelector('video, iframe, canvas, button, input, img, svg') && !(el.textContent || '').trim();
  }

  function removeAds(root = document) {
    if (root.nodeType !== Node.ELEMENT_NODE && root !== document) return;
    if (root !== document && root.matches(selector)) { root.remove(); return; }
    root.querySelectorAll(selector).forEach((element) => element.remove());
  }

  function sweep() {
    removeAds();
    if (document.body) Array.prototype.forEach.call(document.body.querySelectorAll('body > a, body > div, body > span'), (el) => {
      if (isClickCatcher(el)) el.remove();
    });
  }

  // Ads already present, then ads inserted later.
  const start = () => {
    sweep();
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) if (node.nodeType === Node.ELEMENT_NODE) removeAds(node);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(sweep, 1000); // click-catchers are often styled after insertion
  };
  if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);
})();
