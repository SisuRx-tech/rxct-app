/* ========================================
   STUDY CONTENT UTILITIES
   Shared parsing and review labels for
   medicine, class and group profiles.
======================================== */

export const REVIEW_LABELS = {
  imported: "Imported text, not yet reviewed by RxCT.",
  reviewed: "Reviewed by RxCT.",
};

const slug = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function parseEditorial(body) {
  const blocks = [{ title: null, nodes: [] }];
  let paragraph = [];
  let list = null;

  const last = () => blocks[blocks.length - 1];

  const flush = () => {
    if (paragraph.length) {
      last().nodes.push({ type: "p", text: paragraph.join(" ") });
      paragraph = [];
    }

    if (list) {
      last().nodes.push({ type: "ul", items: list });
      list = null;
    }
  };

  for (const raw of String(body ?? "").split("\n")) {
    const line = raw.trim();

    if (!line) {
      flush();
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ title: line.slice(3).trim(), nodes: [] });
    } else if (line.startsWith("- ")) {
      if (paragraph.length) flush();
      (list ??= []).push(line.slice(2).trim());
    } else {
      if (list) flush();
      paragraph.push(line);
    }
  }

  flush();

  return blocks.filter((block) => block.title || block.nodes.length);
}

export { slug };