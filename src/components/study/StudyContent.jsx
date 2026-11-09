import { toScientific } from "../../utils/scientific";
import {
  REVIEW_LABELS,
  parseEditorial,
  slug,
} from "../../utils/studyContent";
import styles from "./StudyProfile.module.css";

/* ========================================
   SHARED CONTENT PIECES
   Used by medicine, class and group
   profiles so they read the same way.
======================================== */





/* ========================================
   SUBSECTION
======================================== */

export function Subsection({ id, title, open, onToggle, children }) {
  return (
    <section className={styles.sub} data-sub={id}>
      <h3 className={styles.subTitle}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`sub-${id}`}
          onClick={onToggle}
        >
          <span>{title}</span>
          <span className={styles.chevron} aria-hidden="true" />
        </button>
      </h3>

      {open && (
        <div className={styles.subBody} id={`sub-${id}`}>
          {children}
        </div>
      )}
    </section>
  );
}

/* ========================================
   BULLETS
   Long lists show the first few points and
   remember whether the student expanded them.
======================================== */

const VISIBLE = 8;

export function Bullets({ id, items, ctx, tone }) {
  const moreKey = `${id}:more`;
  const showAll = ctx.isOpen(moreKey, false);
  const collapsible = items.length > VISIBLE + 2;

  const visible =
    collapsible && !showAll ? items.slice(0, VISIBLE) : items;

  return (
    <>
      <ul
        className={
          tone === "warning"
            ? `${styles.bullets} ${styles.warning}`
            : styles.bullets
        }
      >
        {visible.map((item, index) => (
          <li key={index}>{toScientific(item)}</li>
        ))}
      </ul>

      {collapsible && (
        <button
          type="button"
          className={styles.showMore}
          onClick={() => ctx.toggle(moreKey, false)}
        >
          {showAll ? "Show less" : `Show ${items.length - VISIBLE} more`}
        </button>
      )}
    </>
  );
}

/* ========================================
   EDITORIAL BODY
   Class and group content is written with
   simple structure:
     ## Heading   starts a subsection
     - item       a bullet
     blank line   ends a paragraph
======================================== */



function Nodes({ nodes, id, ctx }) {
  return nodes.map((node, index) =>
    node.type === "p" ? (
      <p className={styles.prose} key={index}>
        {toScientific(node.text)}
      </p>
    ) : (
      <Bullets
        key={index}
        id={`${id}.${index}`}
        items={node.items}
        ctx={ctx}
      />
    ),
  );
}

export function EditorialBody({ body, section, ctx }) {
  const blocks = parseEditorial(body);

  return blocks.map((block, index) => {
    const id = `${section}.${block.title ? slug(block.title) : "intro"}`;

    if (!block.title) {
      return <Nodes key={index} nodes={block.nodes} id={id} ctx={ctx} />;
    }

    return (
      <Subsection
        key={index}
        id={id}
        title={block.title}
        open={ctx.isOpen(id)}
        onToggle={() => ctx.toggle(id)}
      >
        <Nodes nodes={block.nodes} id={id} ctx={ctx} />
      </Subsection>
    );
  });
}

/* ========================================
   SOURCE AND STATUS
   Shown before the content so the reader
   knows where it came from first.
======================================== */

export function SourceLine({ source, status }) {
  return (
    <p className={styles.sourceLine}>
      {source ? `Source: ${source}. ` : "Source not recorded. "}
      {REVIEW_LABELS[status] || "Review status not specified."}
    </p>
  );
}

// Exact label details for text imported from a drug label.
export function SourceFooter({ source, truncated }) {
  return (
    <footer className={styles.sourceFooter}>
      {source && (
        <p>
          Source label: {source.title}, effective {source.effective}.{" "}
          {source.url && (
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              View source label ↗
            </a>
          )}
        </p>
      )}

      <p>
        {truncated && "This section was shortened on import. "}
        Wording is cleaned and split into points for readability. Open
        the source label for the exact text.
      </p>
    </footer>
  );
}

export function EmptySection({ children }) {
  return <p className={styles.empty}>{children}</p>;
}

/* ========================================
   LINK LIST
   Members of a class or group.
======================================== */

export function LinkList({ items }) {
  return (
    <ul className={styles.linkList}>
      {items.map((item) => (
        <li key={item.key}>
          <button type="button" onClick={item.onClick}>
            <span>{item.label}</span>
            {item.meta && <small>{item.meta}</small>}
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ========================================
   GLANCE COMPONENTS
   Compact summaries used by medicine,
   class and therapeutic group profiles.
======================================== */

export function GlanceBlock({ title, children }) {
  return (
    <section className={styles.glanceBlock}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function GlancePoints({ items = [], tone }) {
  return (
    <ul
      className={
        tone === "warning"
          ? `${styles.glancePoints} ${styles.warning}`
          : styles.glancePoints
      }
    >
      {items.map((item, index) => (
        <li key={index}>{toScientific(item)}</li>
      ))}
    </ul>
  );
}

export function GlanceLink({ children, onClick }) {
  return (
    <button
      type="button"
      className={styles.glanceLink}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
