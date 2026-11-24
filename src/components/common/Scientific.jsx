import { memo, useMemo } from "react";

import { parseScientific } from "../../utils/scientific";

import styles from "./Scientific.module.css";

/* ========================================
   SCIENTIFIC TEXT
   Shows imported or stored text with proper
   subscripts, superscripts and arrows.

     <Scientific text={bullet} />

   The text is rendered as plain React text
   (never as HTML), so imported label text
   cannot inject markup.
======================================== */

function Scientific({ text }) {
  const parts = useMemo(() => parseScientific(text), [text]);

  return (
    <>
      {parts.map((part, index) => {
        if (part.type === "sub") {
          return (
            <sub className={styles.sub} key={index}>
              {part.value}
            </sub>
          );
        }

        if (part.type === "sup") {
          return (
            <sup className={styles.sup} key={index}>
              {part.value}
            </sup>
          );
        }

        return part.value;
      })}
    </>
  );
}

export default memo(Scientific);
