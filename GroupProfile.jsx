import { formatClassName } from "../../utils/labelText";

import Scientific from "../common/Scientific";

import StudyProfile from "./StudyProfile";
import {

  EditorialBody,
  SourceLine,
  EmptySection,
  LinkList,
  Subsection,
  GlanceBlock,
  GlanceLink,
  SourceBackedRecords,
} from "./StudyContent";
import { parseEditorial } from "../../utils/studyContent";
import styles from "./StudyProfile.module.css";

/* ========================================
   THERAPEUTIC GROUP PROFILE
   The broadest level: what the group covers,
   which classes belong to it and how they
   relate therapeutically.
======================================== */

const GROUP_SECTIONS = [
   {
    key: "classification",
    label: "Classification",
    short: "Classification",
    icon: "fa-sitemap",
  },
  { key: "overview", label: "Overview", short: "Overview", icon: "fa-circle-info" },

  {
    key: "mechanisms_of_action",
    label: "Mechanisms of Action",
    short: "Mechanisms",
    icon: "fa-flask",
  },
  {
    key: "therapeutic_applications",
    label: "Therapeutic Applications",
    short: "Applications",
    icon: "fa-stethoscope",
  },
  {
    key: "important_considerations",
    label: "Important Considerations",
    short: "Considerations",
    icon: "fa-triangle-exclamation",
  },
];

function GroupProfile({
  group,
  initialSection = "classification",
  initialSub,
  onBack,
  onOpenClass,
  onOpenMedicine,
  onSectionChange,
}) {
  const count = group.classes.length;

  const renderContent = (key) => (ctx) => {
    const record = group.content.find((item) => item.section === key);
    const sourceRecords = group.verifiedSections?.[key] || [];

    const classList =
      key === "classification" && count > 0 ? (
        <Subsection
          id="classification.classes"
          title="Drug classes in this group"
          open={ctx.isOpen("classification.classes")}
          onToggle={() => ctx.toggle("classification.classes")}
        >
          <LinkList
            items={group.classes.map((item) => ({
              key: item.id,
              kind: "class",
              label: formatClassName(item.name),
              meta: `${item.medicineCount} ${
                item.medicineCount === 1 ? "medicine" : "medicines"
              }`,
              onClick: () => onOpenClass(item.name),
            }))}
          />
        </Subsection>
      ) : null;

    if (!record?.body?.trim() && sourceRecords.length > 0) {
      return (
        <>
          {classList}
          <SourceBackedRecords
            records={sourceRecords}
            section={key}
            ctx={ctx}
            onOpenMedicine={onOpenMedicine}
          />
        </>
      );
    }

    if (!record?.body?.trim()) {
      return classList || (
        <EmptySection>
          Study content for this section has not been added yet.
        </EmptySection>
      );
    }

    return (
      <>
        {classList}

        <SourceLine
          source={record.sources?.name}
          status={record.review_status}
        />

        <EditorialBody body={record.body} section={key} ctx={ctx} />

      </>
    );
  };

  const sections = GROUP_SECTIONS.filter(({ key }) =>
    key === "classification" ||
    group.content.some((item) => item.section === key && item.body?.trim()) ||
    (group.verifiedSections?.[key]?.length ?? 0) > 0,
  ).map(({ key, label, short, icon }) => ({
    key,
    label,
    short,
    icon,
    render: renderContent(key),
  }));

  const overview = group.content.find(
    (item) => item.section === "overview",
  )?.body;

  const brief = parseEditorial(overview)
    .flatMap((block) => block.nodes)
    .find((node) => node.type === "p")?.text;

  const renderGlance = ({ jump }) => (
    <GlanceBlock title="In brief">
      <p className={styles.glanceText}>
        <Scientific text={brief} />
      </p>

      <GlanceLink onClick={() => jump("overview")}>
        Read the overview
      </GlanceLink>
    </GlanceBlock>
  );

  return (
    <StudyProfile
      stateKey={`group:${group.name.toLowerCase()}`}
      kindLabel="THERAPEUTIC GROUP"
      title={group.name}
      subtitle={`Therapeutic group with ${count} drug ${
        count === 1 ? "class" : "classes"
      }`}
      notices={
        group.fromCache
          ? ["Showing a saved copy. Reconnect to check for updates."]
          : []
      }
      glance={brief ? renderGlance : undefined}
      sections={sections}
      initialSection={initialSection}
      initialSub={initialSub}
      context={{
        type: "group",
        name: group.name,
        className: null,
        groupName: group.name,
      }}
      onBack={onBack}
      onSectionChange={onSectionChange}
    />
  );
}

export default GroupProfile;
