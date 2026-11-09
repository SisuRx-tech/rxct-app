import { useLayoutEffect } from "react";

import { getReadingState, saveReadingState } from "../services/readingState";
import {
  getScrollParent,
  getScrollTop,
  setScrollTop,
} from "../utils/scroll";

/* ========================================
   SCROLL MEMORY
   Restores where the student was on a page
   (the landing page, a set of search results)
   and keeps it up to date while they scroll.

   A new search has a new key, so it starts
   at the top.
======================================== */

export function useScrollMemory(ref, key, ready) {
  useLayoutEffect(() => {
    if (!ready || !key || !ref.current) return undefined;

    const scroller = getScrollParent(ref.current);
    const target = scroller === window ? window : scroller;

    setScrollTop(scroller, getReadingState(key)?.scroll?.page ?? 0);

    let timer = 0;

    const onScroll = () => {
      clearTimeout(timer);

      timer = setTimeout(() => {
        saveReadingState(key, {
          scroll: { page: getScrollTop(scroller) },
        });
      }, 200);
    };

    target.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      target.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
    };
  }, [ref, key, ready]);
}
