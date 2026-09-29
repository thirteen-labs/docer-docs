/**
 * Scroll tracking for the WebView-backed readers (text, office).
 *
 * These documents have no pages, so progress has to come from how far the
 * reader has scrolled. A small script injected into the page reports the ratio
 * back over the WebView bridge; the reader stores it in a ref that the reading
 * progress hook samples when it flushes.
 */

export const SCROLL_PROGRESS_MESSAGE = 'docer:progress';

/**
 * Runs inside the WebView. Posts the scroll ratio (0..1) whenever it moves by
 * more than ~1%, which is often enough to feel live but rare enough to keep
 * bridge traffic off the JS thread.
 */
export const SCROLL_TRACKER_JS = `
(function () {
  var last = -1;
  function compute() {
    var doc = document.documentElement;
    var body = document.body;
    var height = Math.max(
      doc ? doc.scrollHeight : 0,
      body ? body.scrollHeight : 0
    );
    var max = height - window.innerHeight;
    // Content shorter than the viewport cannot be scrolled, so it is fully read.
    if (max <= 0) return 1;
    var top = window.pageYOffset || (doc ? doc.scrollTop : 0) || 0;
    return Math.min(1, Math.max(0, top / max));
  }
  function report() {
    var ratio = compute();
    if (Math.abs(ratio - last) < 0.01) return;
    last = ratio;
    try {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: '${SCROLL_PROGRESS_MESSAGE}', progress: ratio })
      );
    } catch (e) {}
  }
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () { ticking = false; report(); });
    } else {
      ticking = false;
      report();
    }
  }, { passive: true });
  window.addEventListener('resize', report);
  window.addEventListener('load', report);
  report();
})();
true;
`;

/** Extracts the scroll ratio from a WebView message, or null if unrelated. */
export function parseScrollProgress(data: string): number | null {
  try {
    const parsed = JSON.parse(data);
    if (parsed?.type !== SCROLL_PROGRESS_MESSAGE) return null;
    const value = Number(parsed.progress);
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null;
  } catch {
    return null;
  }
}
