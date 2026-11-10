import { useEffect, useMemo, useState } from "react";

import { searchInteractions } from "../../services/medicines";
import {
  SECTION_ORDER,
  SECTION_LABELS,
  parseSectionBody,
  formatClassName,
} from "../../utils/labelText";

import StudyProfile from "./StudyProfile";
import {
  Subsection,
  Bullets,
  SourceLine,
  SourceFooter,
  EmptySection,
  LinkList,
  GlanceBlock,
  GlancePoints,
  GlanceLink,
} from "./StudyContent";

import styles from "./StudyProfile.module.css";

const SECTION_META = {
  overview: { icon: "fa-circle-info", short: "Overview" },
  indications: { icon: "fa-list-check", short: "Indications" },
  contraindications: { icon: "fa-ban", short: "Contraindications" },
  adverse_effects: { icon: "fa-triangle-exclamation", short: "Adverse" },
  interactions: { icon: "fa-right-left", short: "Interactions" },
};

/* ========================================
   OTHER LABELS THAT MENTION THIS MEDICINE
   A text match, not a verified interaction
   check. Loaded the first time it is opened.
======================================== */

const mentionsCache = new Map();

function MentionedLabels({ name, onOpenMedicine }) {
  const [state, setState] = useState(
    mentionsCache.has(name)
      ? { status: "ready", rows: mentionsCache.get(name) }
      : { status: "loading", rows: [] },
  );

  useEffect(() => {
    if (mentionsCache.has(name)) return undefined;

    let active = true;

    searchInteractions(name)
      .then((rows) => {
        mentionsCache.set(name, rows || []);

        if (active) setState({ status: "ready", rows: rows || [] });
      })
      .catch(() => {
        if (active) setState({ status: "error", rows: [] });
      });

    return () => {
      active = false;
    };
  }, [name]);

  if (state.status === "loading") {
    return <p className={styles.muted}>Checking other labels...</p>;
  }

  if (state.status === "error") {
    return (
      <p className={styles.muted}>
        Other labels could not be checked right now.
      </p>
    );
  }

  if (state.rows.length === 0) {
    return (
      <p className={styles.muted}>
        No other label in RxCT mentions {name}.
      </p>
    );
  }

  return (
    <>
      <p className={styles.muted}>
        Medicines whose interaction text mentions {name}. This is a text
        match, not a verified interaction check.
      </p>

      <LinkList
        items={state.rows.slice(0, 12).map((row) => ({
          key: row.medicine_id,
          kind: "medicine",
          label: row.medicine_name,
          meta: formatClassName(row.drug_class),
          onClick: () => onOpenMedicine(row.medicine_name),
        }))}
      />
    </>
  );
}

/* ========================================
   MEDICINE PROFILE
   Five sections. Overview carries the
   description, classification, mechanism of
   action and pharmacokinetics.
======================================== */

function MedicineProfile({
  medicine,
  initialSection,
  initialSub,
  notice,
  matchedNote,
  onBack,
  onOpenClass,
  onOpenGroup,
  onOpenMedicine,
  onSectionChange,
}) {
  // A medicine can have the same section from more than one source.
  // Prefer a reviewed row, otherwise take the first.
  const records = useMemo(() => {
    const bySection = {};

    for (const record of medicine.medicine_sections || []) {
      const existing = bySection[record.section];

      if (
        !existing ||
        (record.review_status === "reviewed" &&
          existing.review_status !== "reviewed")
      ) {
        bySection[record.section] = record;
      }
    }

    return bySection;
  }, [medicine]);

  const parsed = useMemo(() => {
    const result = {};

    for (const [key, record] of Object.entries(records)) {
      result[key] = parseSectionBody(record.body);
    }

    return result;
  }, [records]);

  const className = formatClassName(medicine.drug_class);

  /* ========================================
     SECTION RENDERERS
  ======================================== */

  const sub = (ctx, id, title, content) => (
    <Subsection
      key={id}
      id={id}
      title={title}
      open={ctx.isOpen(id)}
      onToggle={() => ctx.toggle(id)}
    >
      {content}
    </Subsection>
  );

  const renderOverview = (ctx) => {
    const blocks = parsed.overview?.blocks || [];
    const byTitle = (title) => blocks.find((block) => block.title === title);

    const description =
      byTitle("Description") || blocks.find((block) => !block.title);

    const bullets = (id, block) => (
      <Bullets id={id} items={block.bullets} ctx={ctx} />
    );

    const mechanism = byTitle("Mechanism of Action");
    const kinetics = byTitle("Pharmacokinetics");
    const profile = byTitle("Pharmacological Profile");

    return (
      <>
        {description &&
          sub(ctx, "overview.description", "Description",
            bullets("overview.description", description))}

        {mechanism &&
          sub(ctx, "overview.mechanism", "Mechanism of action",
            bullets("overview.mechanism", mechanism))}

        {kinetics &&
          sub(ctx, "overview.pharmacokinetics", "Pharmacokinetics",
            bullets("overview.pharmacokinetics", kinetics))}

        {profile &&
          sub(ctx, "overview.profile", "Other pharmacological properties",
            bullets("overview.profile", profile))}
      </>
    );
  };

  const renderBlocks = (key, ctx) => {
    const blocks = parsed[key]?.blocks || [];

    if (blocks.length === 1 && !blocks[0].title) {
      return (
        <Bullets
          id={key}
          items={blocks[0].bullets}
          ctx={ctx}
          tone={key === "contraindications" ? "warning" : undefined}
        />
      );
    }

    return blocks.map((block, index) => {
      const id = `${key}.${index}`;

      return sub(
        ctx,
        id,
        block.title || "General",
        <Bullets
          id={id}
          items={block.bullets}
          ctx={ctx}
          tone={key === "contraindications" ? "warning" : undefined}
        />,
      );
    });
  };

  const renderSection = (key) => (ctx) => {
    const record = records[key];
    const data = parsed[key];

    if (!record || !data || data.blocks.length === 0) {
      return (
        <EmptySection>
          No {SECTION_LABELS[key].toLowerCase()} information is recorded
          for {medicine.name} yet.
        </EmptySection>
      );
    }

    return (
      <>
        <SourceLine
          source={record.sources?.name}
          status={record.review_status}
        />

        {key === "overview"
          ? renderOverview(ctx)
          : renderBlocks(key, ctx)}

        {key === "interactions" &&
          sub(
            {
              isOpen: (id) => ctx.isOpen(id, false),
              toggle: (id) => ctx.toggle(id, false),
            },
            "interactions.mentions",
            "Mentioned in other labels",
            ctx.isOpen("interactions.mentions", false) && (
              <MentionedLabels
                name={medicine.name}
                onOpenMedicine={onOpenMedicine}
              />
            ),
          )}

        <SourceFooter
          source={data.source}
          truncated={data.truncated}
        />
      </>
    );
  };

  const hasContent = (key) => parsed[key]?.blocks.length > 0;

  const sections = SECTION_ORDER.filter(hasContent).map((key) => ({
    key,
    label: SECTION_LABELS[key],
    ...SECTION_META[key],
    render: renderSection(key),
  }));

  /* ========================================
     AT A GLANCE
     Classification first, then the points a
     student most needs to see. Full text
     stays in the sections.
  ======================================== */
const points = (key) =>
  (parsed[key]?.blocks || [])
    .flatMap((block) => block.bullets)
    .filter((text) => text.length >= 20 && text.length <= 180)
    .slice(0, 2);

  const contraindications = points("contraindications");
  const interactions = points("interactions");

 const renderGlance = ({ jump }) => (
  <>
    {contraindications.length > 0 && (
      <GlanceBlock title="Contraindications">
        <GlancePoints
          items={contraindications}
          tone="warning"
        />

        <GlanceLink
          onClick={() => jump("contraindications")}
        >
          View full section
        </GlanceLink>
      </GlanceBlock>
    )}

    {interactions.length > 0 && (
      <GlanceBlock title="Interaction information">
        <GlancePoints items={interactions} />

        <GlanceLink
          onClick={() => jump("interactions")}
        >
          View full section
        </GlanceLink>
      </GlanceBlock>
    )}
  </>
);

  /* ========================================
     RENDER
  ======================================== */

  const trail = [
    medicine.group && {
      label: medicine.group.name,
      onClick: () => onOpenGroup(medicine.group.name),
    },
    medicine.drug_class && {
      label: className,
      onClick: () => onOpenClass(medicine.drug_class),
    },
  ].filter(Boolean);

  return (
    <StudyProfile
      stateKey={`medicine:${medicine.name.toLowerCase()}`}
      kindLabel="MEDICINE"
      title={medicine.name}
   subtitle="Medicine profile"
      trail={trail}
      notices={[
        notice,
        matchedNote,
        medicine.fromCache &&
          "Showing a saved copy. Reconnect to check for updates.",
      ].filter(Boolean)}
      glance={renderGlance}
      sections={sections}
      initialSection={initialSection}
      initialSub={initialSub}
      context={{
        type: "medicine",
        name: medicine.name,
        className: className || null,
        groupName: medicine.group?.name || null,
      }}
      onBack={onBack}
      onSectionChange={onSectionChange}
    />
  );
}

export default MedicineProfile;
