export const currentGoal = {
  program: "Ruankao",
  track: "Software Designer",
  cycle: "2026 H1",
  targetDate: "2026-05-24",
  dailyMinutes: 90
};

export const dashboardMetrics = [
  { label: "Tasks Today", value: "3", tone: "primary" },
  { label: "Wrong Notes Due", value: "12", tone: "danger" },
  { label: "Weak Nodes", value: "5", tone: "teal" },
  { label: "AI Jobs", value: "2", tone: "ai" }
] as const;

export const todayTasks = [
  "Practice 20 basic knowledge questions",
  "Retry wrong notes tagged memory gap",
  "Review data structure knowledge nodes"
];

export const weakKnowledgeNodes = [
  "UML modeling",
  "Database normalization",
  "Network security basics",
  "Algorithm complexity",
  "Software testing strategy"
];

export const recentJobs = [
  { label: "Wrong-note explanation", status: "completed" },
  { label: "Material question extraction", status: "queued" }
];
