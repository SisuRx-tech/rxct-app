import "./Splash.css";
import { useEffect } from "react";

function Splash({ onFinish }) {
  useEffect(() => {
    // Keep the app from getting stuck if the browser does not dispatch the
    // animation event (for example when animations are throttled or disabled).
    const fallback = window.setTimeout(onFinish, 2400);

    return () => window.clearTimeout(fallback);
  }, [onFinish]);

  return (
    <div
      className="splash-screen"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) {
          onFinish();
        }
      }}
    >
      <div className="splash-logo">
        <img src="/rxct-x-icon-512.png" alt="" className="splash-mark" />
        <img src="/rxct-logo.png" alt="RxCT" className="splash-full-logo" />
      </div>
    </div>
  );
}

export default Splash;
