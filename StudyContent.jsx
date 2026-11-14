import Scientific from "../common/Scientific";
import { parseSectionBody } from "../../utils/labelText";
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
          <li key={index}><Scientific text={item} /></li>
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
        <Scientific text={node.text} />
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

/* ========================================
   MEDICINE LABEL TEXT ON CLASS AND GROUP PAGES
   Cleaned the same way as a medicine's own
   profile: headings, short points, a source
   line and the label link. Each medicine is
   its own collapsible block. A few medicines
   open by default, a long list stays closed.
======================================== */

const OPEN_BY_DEFAULT_LIMIT = 3;

export function SourceBackedRecords({
  records = [],
  section,
  ctx,
  onOpenMedicine,
}) {
  const openByDefault = records.length <= OPEN_BY_DEFAULT_LIMIT;

  const blocks = records
    .map((record, index) => {
      const body = String(record.body ?? "");
      const editorial = /(^|\n)##\s/.test(body);
      const data = editorial ? null : parseSectionBody(body);

      if (!editorial && data.blocks.length === 0) return null;

      const id = `${section}.${slug(record.medicineName)}.${index}`;

      return (
        <Subsection
          key={id}
          id={id}
          title={record.medicineName}
          open={ctx.isOpen(id, openByDefault)}
          onToggle={() => ctx.toggle(id, openByDefault)}
        >
          <SourceLine
            source={record.sources?.name}
            status={record.review_status}
          />

          {editorial ? (
            <EditorialBody body={body} section={id} ctx={ctx} />
          ) : (
            data.blocks.map((block, blockIndex) => (
              <div className={styles.recordBlock} key={blockIndex}>
                {block.title && (
                  <h4 className={styles.blockHeading}>{block.title}</h4>
                )}

                <Bullets
                  id={`${id}.${blockIndex}`}
                  items={block.bullets}
                  ctx={ctx}
                  tone={
                    section === "contraindications" ? "warning" : undefined
                  }
                />
              </div>
            ))
          )}

          {data && (
            <SourceFooter source={data.source} truncated={data.truncated} />
          )}

          {onOpenMedicine && (
            <button
              type="button"
              className={styles.openProfile}
              onClick={() => onOpenMedicine(record.medicineName)}
            >
              Open {record.medicineName} profile
            </button>
          )}
        </Subsection>
      );
    })
    .filter(Boolean);

  if (blocks.length === 0) return null;

  return (
    <>
      {blocks.length > 1 && (
        <p className={styles.muted}>
          {blocks.length} medicines have label text for this section.
          Open one to read it.
        </p>
      )}

      {blocks}
    </>
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
        <li key={index}><Scientific text={item} /></li>
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
