/* ========================================
   SCROLL HELPERS
   RxCT does not assume whether the window
   or a layout container scrolls, so these
   find the real scroller at runtime.
======================================== */

export function getScrollParent(node) {
  let element = node?.parentElement;

  while (
    element &&
    element !== document.body &&
    element !== document.documentElement
  ) {
    const { overflowY } = getComputedStyle(element);

    if (
      /(auto|scroll|overlay)/.test(overflowY) &&
      element.scrollHeight > element.clientHeight + 1
    ) {
      return element;
    }

    element = element.parentElement;
  }

  return window;
}

export const getScrollTop = (scroller) =>
  scroller === window ? window.scrollY : scroller.scrollTop;

export function setScrollTop(scroller, value) {
  if (scroller === window) {
    window.scrollTo({ top: value, left: 0, behavior: "auto" });
  } else {
    scroller.scrollTop = value;
  }
}

// Distance of a node from the top of the scrollable content.
export function offsetWithin(node, scroller) {
  const base =
    scroller === window ? 0 : scroller.getBoundingClientRect().top;

  return (
    node.getBoundingClientRect().top - base + getScrollTop(scroller)
  );
}

// Where, in the viewport, sticky UI must sit so it clears the Topbar
// and stays inside the scrolling area. Works whether the window or a
// layout container scrolls, and whether the Topbar overlaps or not.
export function measureViewportTop(node) {
  const scroller = getScrollParent(node);

  const bar =
    document.querySelector("[data-global-search]")?.closest("header") ||
    document.querySelector("header");

  let top = scroller === window ? 0 : scroller.getBoundingClientRect().top;

  if (bar) {
    const { position } = getComputedStyle(bar);

    if (position === "sticky" || position === "fixed") {
      top = Math.max(top, bar.getBoundingClientRect().bottom);
    }
  }

  return Math.max(0, Math.round(top));
}

export function scrollToY(scroller, value, smooth) {
  const behavior =
    smooth && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ? "smooth"
      : "auto";

  if (scroller === window) {
    window.scrollTo({ top: value, left: 0, behavior });
  } else {
    scroller.scrollTo({ top: value, left: 0, behavior });
  }
}
