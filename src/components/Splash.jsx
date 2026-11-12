import { useLayoutEffect } from "react";

/*
  The actual splash is an inline HTML overlay in index.html so it can paint
  before React starts. This tiny component signals that the application tree
  (including its first route) has mounted underneath that overlay.
*/
function Splash() {
  useLayoutEffect(() => {
    window.dispatchEvent(new Event("rxct-app-ready"));
  }, []);

  return null;
}

export default Splash;
