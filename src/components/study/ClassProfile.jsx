import { formatClassName } from "../../utils/labelText";

import StudyProfile from "./StudyProfile";
import {

  EditorialBody,
  SourceLine,
  EmptySection,
  LinkList,
  GlanceBlock,
  GlanceLink,
} from "./StudyContent";
import { parseEditorial } from "../../utils/studyContent";
import styles from "./StudyProfile.module.css";

/* ========================================
   DRUG CLASS PROFILE
   The class itself: what unites it and how
   it works. Medicine-specific detail lives
   in each medicine's own profile.
======================================== */

const CLASS_SECTIONS = [
  { key: "overview", label: "Overview", short: "Overview", icon: "fa-circle-info" },
  {
    key: "mechanism_pharmacology",
    label: "Mechanism and Pharmacology",
    short: "Mechanism",
    icon: "fa-flask",
  },
  {
    key: "therapeutic_applications",
    label: "Therapeutic Applications",
    short: "Applications",
    icon: "fa-stethoscope",
  },
  {
    key: "safety_limitations",
    label: "Safety and Limitations",
    short: "Safety",
    icon: "fa-shield-halved",
  },
  { key: "members", label: "Class Members", short: "Members", icon: "fa-capsules" },
];

function ClassProfile({
  drugClass,
  initialSection,
  initialSub,
  onBack,
  onOpenMedicine,
  onOpenGroup,
  onSectionChange,
}) {
  const title = formatClassName(drugClass.name);
  const count = drugClass.medicines.length;

  const renderContent = (key) => (ctx) => {
    const record = drugClass.content.find((item) => item.section === key);

    if (!record?.body?.trim()) {
      return (
        <EmptySection>
          Study content for this section has not been added yet.
        </EmptySection>
      );
    }

    return (
      <>
        <SourceLine
          source={record.sources?.name}
          status={record.review_status}
        />

        <EditorialBody body={record.body} section={key} ctx={ctx} />
      </>
    );
  };

  const renderMembers = () =>
    count === 0 ? (
      <EmptySection>
        No medicines are linked to this class yet.
      </EmptySection>
    ) : (
      <>
        <p
          style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 13 }}
        >
          Class-level information applies to the class as a whole.
          Individual medicines can differ, so open a medicine for its
          own details.
        </p>

        <LinkList
          items={drugClass.medicines.map((medicine) => ({
            key: medicine.id,
            kind: "medicine",
            label: medicine.name,
            onClick: () => onOpenMedicine(medicine.name),
          }))}
        />
      </>
    );

  const hasBody = (key) =>
    drugClass.content.some((item) => item.section === key && item.body?.trim());

  const sections = CLASS_SECTIONS.filter(
    ({ key }) => key === "members" || hasBody(key),
  ).map(({ key, label, short, icon }) => ({
    key,
    label,
    short,
    icon,
    render: key === "members" ? renderMembers : renderContent(key),
  }));

  // A glance only when it adds something the sections do not already
  // show. The members have their own section, so they are not repeated.
  const overview = drugClass.content.find(
    (item) => item.section === "overview",
  )?.body;

  const brief = parseEditorial(overview)
    .flatMap((block) => block.nodes)
    .find((node) => node.type === "p")?.text;

  const renderGlance = ({ jump }) => (
    <GlanceBlock title="In brief">
      <p className={styles.glanceText}>{brief}</p>

      <GlanceLink onClick={() => jump("overview")}>
        Read the overview
      </GlanceLink>
    </GlanceBlock>
  );

  return (
    <StudyProfile
      stateKey={`class:${drugClass.name.toLowerCase()}`}
      kindLabel="DRUG CLASS"
      title={title}
      subtitle={`Drug class with ${count} ${
        count === 1 ? "medicine" : "medicines"
      }`}
      trail={
        drugClass.group
          ? [
              {
                label: drugClass.group.name,
                onClick: () => onOpenGroup(drugClass.group.name),
              },
            ]
          : []
      }
      notices={
        drugClass.fromCache
          ? ["Showing a saved copy. Reconnect to check for updates."]
          : []
      }
      glance={brief ? renderGlance : undefined}
      sections={sections}
      initialSection={initialSection}
      initialSub={initialSub}
      context={{
        type: "class",
        name: drugClass.name,
        className: drugClass.name,
        groupName: drugClass.group?.name || null,
      }}
      onBack={onBack}
      onSectionChange={onSectionChange}
    />
  );
}

export default ClassProfile;
