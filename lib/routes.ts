import type { Route } from "next";

export type AppSection = "learner" | "admin";

export type RouteItem = {
  id: string;
  href: Route;
  label: string;
  description: string;
  section: AppSection;
  status: "foundation" | "planned";
};

export const learnerRoutes: RouteItem[] = [
  {
    id: "dashboard",
    href: "/dashboard",
    label: "Dashboard",
    description: "Current goal, tasks, weak points, wrong notes, and AI job status.",
    section: "learner",
    status: "foundation"
  },
  {
    id: "goals",
    href: "/goals",
    label: "Goals",
    description: "Exam program, track, cycle, target date, score target, and daily time.",
    section: "learner",
    status: "planned"
  },
  {
    id: "practice",
    href: "/practice",
    label: "Practice",
    description: "Random, knowledge-node, real-paper, wrong-note, and AI-generated practice.",
    section: "learner",
    status: "planned"
  },
  {
    id: "papers",
    href: "/papers",
    label: "Papers",
    description: "Real papers, mock papers, and focused paper sets.",
    section: "learner",
    status: "planned"
  },
  {
    id: "attempts",
    href: "/attempts",
    label: "Attempts",
    description: "Timed attempts, autosave state, answer sheets, and score reports.",
    section: "learner",
    status: "planned"
  },
  {
    id: "wrong-notes",
    href: "/wrong-notes",
    label: "Wrong Notes",
    description: "Mistake tags, mastery state, AI explanations, retries, and review cards.",
    section: "learner",
    status: "planned"
  },
  {
    id: "knowledge",
    href: "/knowledge",
    label: "Knowledge",
    description: "Syllabus trees, related questions, common mistakes, and mastery signals.",
    section: "learner",
    status: "planned"
  },
  {
    id: "materials",
    href: "/materials",
    label: "Materials",
    description: "Uploads, extraction jobs, candidate questions, and private confirmation.",
    section: "learner",
    status: "planned"
  },
  {
    id: "plan",
    href: "/plan",
    label: "Plan",
    description: "Structured 14-day study plans grounded in goals and performance data.",
    section: "learner",
    status: "planned"
  },
  {
    id: "analysis",
    href: "/analysis",
    label: "Analysis",
    description: "Weak-point ranking, score risks, mastery, and recommended next actions.",
    section: "learner",
    status: "planned"
  },
  {
    id: "ai-tasks",
    href: "/ai/tasks",
    label: "AI Tasks",
    description: "AI explanations, extraction, image generation, diagnosis, and job progress.",
    section: "learner",
    status: "planned"
  },
  {
    id: "profile",
    href: "/profile",
    label: "Profile",
    description: "Account settings, BYOK provider keys, usage limits, and data deletion.",
    section: "learner",
    status: "planned"
  }
];

export const adminRoutes: RouteItem[] = [
  {
    id: "admin",
    href: "/admin",
    label: "Admin",
    description: "Platform overview for content, jobs, AI usage, users, and audit events.",
    section: "admin",
    status: "foundation"
  },
  {
    id: "admin-exams",
    href: "/admin/exams",
    label: "Exams",
    description: "Programs, tracks, cycles, subjects, syllabi, and knowledge trees.",
    section: "admin",
    status: "planned"
  },
  {
    id: "admin-knowledge",
    href: "/admin/knowledge",
    label: "Knowledge",
    description: "Knowledge node governance, weights, classifications, and uncategorized items.",
    section: "admin",
    status: "planned"
  },
  {
    id: "admin-questions",
    href: "/admin/questions",
    label: "Questions",
    description: "Question review, source policy, visibility, versions, and takedowns.",
    section: "admin",
    status: "planned"
  },
  {
    id: "admin-papers",
    href: "/admin/papers",
    label: "Papers",
    description: "Paper ordering, sections, scores, real papers, and mock sets.",
    section: "admin",
    status: "planned"
  },
  {
    id: "admin-materials",
    href: "/admin/materials",
    label: "Materials",
    description: "Uploaded assets, extraction jobs, source references, and processing errors.",
    section: "admin",
    status: "planned"
  },
  {
    id: "admin-ai",
    href: "/admin/ai",
    label: "AI",
    description: "Provider presets, task routing, limits, prompt versions, and usage logs.",
    section: "admin",
    status: "planned"
  },
  {
    id: "admin-jobs",
    href: "/admin/jobs",
    label: "Jobs",
    description: "Database-backed queue status, retries, failures, and progress tracking.",
    section: "admin",
    status: "planned"
  },
  {
    id: "admin-users",
    href: "/admin/users",
    label: "Users",
    description: "User roles, usage limits, AI call totals, and account state.",
    section: "admin",
    status: "planned"
  },
  {
    id: "admin-audit",
    href: "/admin/audit",
    label: "Audit",
    description: "Append-only events for visibility, source, model, and admin setting changes.",
    section: "admin",
    status: "planned"
  }
];

export const allRoutes = [...learnerRoutes, ...adminRoutes];

export function getRoute(id: string) {
  const route = allRoutes.find((item) => item.id === id);

  if (!route) {
    throw new Error(`Unknown route id: ${id}`);
  }

  return route;
}
