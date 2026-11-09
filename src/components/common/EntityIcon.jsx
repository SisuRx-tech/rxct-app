import styles from "./EntityIcon.module.css";

/* ========================================
   ENTITY ICON
   One visual language for what a thing is,
   used everywhere in RxCT:

     medicine  capsules, warm orange tint
     class     layers, soft green tint
     group     sitemap, muted blue tint
======================================== */

const ICONS = {
  medicine: "fa-capsules",
  class: "fa-layer-group",
  group: "fa-sitemap",
};

function EntityIcon({ kind = "medicine", size = "md" }) {
  return (
    <span
      className={`${styles.icon} ${styles[kind]} ${styles[size]}`}
      aria-hidden="true"
    >
      <i className={`fa-solid ${ICONS[kind] || ICONS.medicine}`}></i>
    </span>
  );
}

export default EntityIcon;
