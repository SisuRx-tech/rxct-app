import { readAccountStorage, writeAccountStorage } from "./accountStorage";

const STORAGE_KEY = "rxct-study-brain";

function accountIdOf(id) {
  if (!id) throw new Error("A signed-in account is required.");
  return String(id);
}

function localDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getStudyTasks(accountId, courseId) {
  const data = readAccountStorage(STORAGE_KEY, {}, accountIdOf(accountId));
  const tasks = Array.isArray(data?.[courseId]) ? data[courseId] : [];

  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return String(a.dueAt || "9999").localeCompare(String(b.dueAt || "9999"));
  });
}

// Correct common mistakes in words relevant to intent recognition.
function correctWords(text) {
  const corrections = {
    red: "read",
    tommorow: "tomorrow",
    tomorow: "tomorrow",
    tommorrow: "tomorrow",
    wensday: "wednesday",
    wendsday: "wednesday",
    wednsday: "wednesday",
    thurday: "thursday",
    thrsday: "thursday",
    febuary: "february",
    agust: "august",
    octomber: "october",
    revison: "revision",
    remeber: "remember",
    rember: "remember",
    assigment: "assignment",
    practicle: "practical",
    pharmacolgy: "pharmacology",
  };

  return text.toLowerCase().replace(/[a-z]+/g, (word) => corrections[word] || word);
}

const numberWords = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
};

function resolveDate(text) {
  const lower = correctWords(text);
  const now = new Date();
  const date = new Date(now);

  if (/\bday after tomorrow\b/.test(lower)) {
    date.setDate(date.getDate() + 2);
    return localDate(date);
  }

  if (/\btoday\b/.test(lower)) return localDate(now);

  if (/\btomorrow\b/.test(lower)) {
    date.setDate(date.getDate() + 1);
    return localDate(date);
  }

  const relative = lower.match(
    /\bin\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|\d{1,2})\s+days?\b/
  );

  if (relative) {
    date.setDate(date.getDate() + (numberWords[relative[1]] || Number(relative[1])));
    return localDate(date);
  }

  if (/\bnext week\b/.test(lower)) {
    date.setDate(date.getDate() + 7);
    return localDate(date);
  }

  if (/\b(end of this week|by the end of the week|end of week)\b/.test(lower)) {
    const offset = (5 - now.getDay() + 7) % 7 || 7;
    date.setDate(date.getDate() + offset);
    return localDate(date);
  }

  const weekdays = [
    "sunday", "monday", "tuesday", "wednesday",
    "thursday", "friday", "saturday",
  ];

  const weekday = lower.match(
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/
  );

  if (weekday) {
    const target = weekdays.indexOf(weekday[1]);
    let offset = (target - now.getDay() + 7) % 7;

    if (/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.test(lower)) {
      if (offset === 0) offset = 7;
      else offset += 7;
    } else if (offset === 0) {
      offset = 7;
    }

    date.setDate(date.getDate() + offset);
    return localDate(date);
  }

  // Nigerian date convention: DD/MM or DD/MM/YYYY.
  const numeric = lower.match(
    /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/
  );

  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    let year = numeric[3]
      ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3])
      : now.getFullYear();

    let parsed = new Date(year, month - 1, day);

    if (
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day
    ) return "";

    if (!numeric[3] && parsed < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      year += 1;
      parsed = new Date(year, month - 1, day);
    }

    return localDate(parsed);
  }

  const months = {
    january: 0, february: 1, march: 2, april: 3,
    may: 4, june: 5, july: 6, august: 7,
    september: 8, october: 9, november: 10, december: 11,
    jan: 0, feb: 1, mar: 2, apr: 3, jun: 5,
    jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
  };

  const monthMatch = lower.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/
  ) || lower.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/
  );

  if (monthMatch) {
    const firstIsDay = /^\d/.test(monthMatch[1]);
    const day = Number(firstIsDay ? monthMatch[1] : monthMatch[2]);
    const month = months[firstIsDay ? monthMatch[2] : monthMatch[1]];
    const yearMatch = lower.match(/\b20\d{2}\b/);
    let year = yearMatch ? Number(yearMatch[0]) : now.getFullYear();
    let parsed = new Date(year, month, day);

    if (
      parsed.getMonth() !== month ||
      parsed.getDate() !== day
    ) return "";

    if (!yearMatch && parsed < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      year += 1;
      parsed = new Date(year, month, day);
    }

    return localDate(parsed);
  }

  return "";
}

const assessmentWords =
  /\b(test|exam|examination|quiz|quizzes|assessment|midterm|midterms|paper|practical|viva)\b/;

const studyWords =
  /\b(read|reading|revise|revision|review|study|studying|learn|learning|cover|covering|prepare|preparing|prep|practice|practise|solve|solving|memorise|memorize|go through|work on|finish|complete|submit|assignment|presentation|project|lab report|report|attend|lecture|tutorial)\b/;

const reminderWords =
  /\b(remind me|remember to|don't forget|do not forget|make sure|i need to|i have to|i must|i should|i plan to|i want to|i intend to|i'm supposed to|i am supposed to|i ought to|gotta|have got to)\b/;

function cleanTitle(text) {
  return text
    .replace(/^(please\s+)?(remind me to|remember to|don't forget to|do not forget to|make sure to)\s+/i, "")
    .replace(/^(i need to|i have to|i must|i should|i plan to|i want to|i intend to|i'm supposed to|i am supposed to|i ought to)\s+/i, "")
    .replace(/^(i have|i've got|i got)\s+(a|an)\s+/i, "")
    .replace(/\b(before|by|on|for|at)\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/ig, "")
    .replace(/\b(today|tomorrow|next week|end of this week|by the end of the week)\b/ig, "")
    .replace(/\bin\s+\d+\s+days?\b/ig, "")
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "")
    .trim();
}

export function interpretStudyIntent(input) {
  const original = String(input || "").trim().replace(/\s+/g, " ");
  if (!original) return null;

  const text = correctWords(original);
  const assessment = assessmentWords.test(text);
  const study = studyWords.test(text);
  const reminder = reminderWords.test(text);
  const dueAt = resolveDate(text);

  // Do not turn ordinary descriptions or opinions into tasks.
  const explicitIntent = reminder || dueAt;
  const directAction = /^(read|revise|review|study|prepare|practice|practise|solve|submit|complete|finish|attend|memorise|memorize|go through)\b/.test(text);

  if (!assessment && !study && !reminder) return null;
  if (!explicitIntent && !directAction) return null;

  const completed =
    /\b(i have finished|i've finished|completed|done with|already read|already revised|i have read|i've read|i have revised|i've revised)\b/.test(text);

  let title = cleanTitle(original);

  if (!title) {
    title = assessment ? "Assessment" : "Study task";
  }

  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    type: assessment ? "assessment" : study ? "study" : "reminder",
    dueAt,
    completed,
    sourceText: original,
  };
}

export function saveStudyTask(accountId, courseId, task) {
  const id = accountIdOf(accountId);
  if (!courseId) throw new Error("Choose a course first.");

  const data = readAccountStorage(STORAGE_KEY, {}, id) || {};
  const tasks = Array.isArray(data[courseId]) ? data[courseId] : [];

  const normalizedText = String(task.sourceText || task.title || "").trim().toLowerCase();

  const duplicate = !task.id
    ? tasks.find((item) =>
        String(item.sourceText || item.title || "").trim().toLowerCase() === normalizedText
      )
    : null;

  const next = {
    ...task,
    id: task.id || duplicate?.id || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    updatedAt: new Date().toISOString(),
  };

  const index = tasks.findIndex((item) => item.id === next.id);

  if (index >= 0) {
    tasks[index] = { ...tasks[index], ...next };
  } else {
    tasks.unshift(next);
  }

  data[courseId] = tasks;

  if (!writeAccountStorage(STORAGE_KEY, data, id)) {
    throw new Error("Could not save this study reminder. Check that you are still signed in.");
  }

  return getStudyTasks(id, courseId);
}

export function completeStudyTask(accountId, courseId, taskId) {
  const tasks = getStudyTasks(accountId, courseId);
  const task = tasks.find((item) => item.id === taskId);

  if (!task) return tasks;

  return saveStudyTask(accountId, courseId, { ...task, completed: true });
}

export function deleteStudyTask(accountId, courseId, taskId) {
  const id = accountIdOf(accountId);
  const data = readAccountStorage(STORAGE_KEY, {}, id) || {};
  const tasks = Array.isArray(data[courseId]) ? data[courseId] : [];

  data[courseId] = tasks.filter((task) => task.id !== taskId);

  if (!writeAccountStorage(STORAGE_KEY, data, id)) {
    throw new Error("Could not delete this reminder. Check that you are still signed in.");
  }

  return getStudyTasks(id, courseId);
}
