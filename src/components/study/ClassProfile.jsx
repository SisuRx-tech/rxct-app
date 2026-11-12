import { formatClassName } from "../../utils/labelText";
import Scientific from "../common/Scientific";
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
   Class members are medicines. All remaining
   tabs are rendered only from class_content.
======================================== */

const CLASS_SECTIONS = [
  {
    key: "members",
    label: "Classification",
    short: "Classification",
    icon: "fa-sitemap",
  },
  {
    key: "overview",
    label: "Overview",
    short: "Overview",
    icon: "fa-circle-info",
  },
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
];

function ClassProfile({
  drugClass,
  initialSection = "members",
  initialSub,
  onBack,
  onOpenMedicine,
  onOpenGroup,
  onSectionChange,
}) {
  const title = formatClassName(drugClass.name);
  const medicines = drugClass.medicines || [];
  const count = medicines.length;

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
      <EmptySection>No medicines are linked to this class yet.</EmptySection>
    ) : (
      <>
        <p className={styles.prose}>
          This profile describes the class as a whole. Individual medicines
          can differ; open a medicine for its own indications, dosage,
          contraindications, adverse effects and interactions.
        </p>
        <LinkList
          items={medicines.map((medicine) => ({
            key: medicine.id,
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

  const overview = drugClass.content.find(
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
