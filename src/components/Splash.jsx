import "./Splash.css";

function Splash({ onFinish }) {
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
        <img
          src="/rxct-word-layer.png"
          alt=""
          className="splash-word"
        />

        <img
          src="/rxct-x-layer.png"
          alt=""
          className="splash-x"
        />
      </div>
    </div>
  );
}

export default Splash;