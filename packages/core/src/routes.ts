export type AppSection = "learner" | "admin";

export type RouteItem = {
  id: string;
  href: `/${string}`;
  label: string;
  description: string;
  section: AppSection;
  status: "foundation" | "planned";
};

export const learnerRoutes: RouteItem[] = [
  {
    id: "dashboard",
    href: "/dashboard",
    label: "仪表盘",
    description: "当前目标、今日任务、薄弱点、错题和 AI 任务状态。",
    section: "learner",
    status: "foundation"
  },
  {
    id: "goals",
    href: "/goals",
    label: "考试目标",
    description: "考试项目、方向、批次、目标日期、目标分和每日学习时间。",
    section: "learner",
    status: "foundation"
  },
  {
    id: "practice",
    href: "/practice",
    label: "练习",
    description: "当前目标下的多题型练习、自动判题、结果反馈和错题入口。",
    section: "learner",
    status: "foundation"
  },
  {
    id: "practice-generate",
    href: "/practice/generate",
    label: "AI 出题",
    description: "按当前考试目标生成私有候选练习题，确认后进入个人题库。",
    section: "learner",
    status: "foundation"
  },
  {
    id: "question-bank",
    href: "/questions",
    label: "我的题库",
    description: "查看学习者自己确认入库的私有题，按来源筛选并进入单题练习。",
    section: "learner",
    status: "foundation"
  },
  {
    id: "papers",
    href: "/papers",
    label: "试卷",
    description: "当前目标下的公开试卷、答题卡、整卷作答和提交报告。",
    section: "learner",
    status: "foundation"
  },
  {
    id: "attempts",
    href: "/attempts",
    label: "作答记录",
    description: "练习和试卷提交记录、得分、答案、解析和作答报告。",
    section: "learner",
    status: "foundation"
  },
  {
    id: "wrong-notes",
    href: "/wrong-notes",
    label: "错题本",
    description: "自动收集错误答案，按知识点筛选，查看解析并维护掌握状态。",
    section: "learner",
    status: "foundation"
  },
  {
    id: "knowledge",
    href: "/knowledge",
    label: "知识点",
    description: "大纲知识树、关联题目、常见错误和掌握度信号。",
    section: "learner",
    status: "foundation"
  },
  {
    id: "knowledge-detail",
    href: "/knowledge/[nodeId]",
    label: "知识点详情",
    description: "单个知识点的描述、考纲要求、关联题目、常见错误和笔记。",
    section: "learner",
    status: "foundation"
  },
  {
    id: "materials",
    href: "/materials",
    label: "资料",
    description: "资料上传、抽取任务、候选题目和私有确认流程。",
    section: "learner",
    status: "foundation"
  },
  {
    id: "plan",
    href: "/plan",
    label: "学习计划",
    description: "基于考试日期、每日时间和练习数据生成滚动学习计划。支持调整、历史查看和放弃。",
    section: "learner",
    status: "foundation"
  },
  {
    id: "plan-detail",
    href: "/plan/[planId]",
    label: "计划详情",
    description: "查看历史学习计划的任务明细。",
    section: "learner",
    status: "foundation"
  },
  {
    id: "analysis",
    href: "/analysis",
    label: "学习分析",
    description: "薄弱点排序、分数风险、掌握度和下一步建议。",
    section: "learner",
    status: "foundation"
  },
  {
    id: "ai-tasks",
    href: "/ai/tasks",
    label: "AI 任务",
    description: "AI 解析调用记录、模型、提示词版本、状态和错误摘要。",
    section: "learner",
    status: "foundation"
  },
  {
    id: "ai-chat",
    href: "/ai/chat",
    label: "AI 对话",
    description: "绑定资料、题目、错题、知识点、计划或报告的上下文问答。",
    section: "learner",
    status: "foundation"
  },
  {
    id: "profile",
    href: "/profile",
    label: "个人设置",
    description: "账号设置、OpenAI BYOK、使用限制和数据删除。",
    section: "learner",
    status: "foundation"
  }
];

export const adminRoutes: RouteItem[] = [
  {
    id: "admin",
    href: "/admin",
    label: "管理台",
    description: "内容、任务、AI 用量、用户和审计事件概览。",
    section: "admin",
    status: "foundation"
  },
  {
    id: "admin-exams",
    href: "/admin/exams",
    label: "考试",
    description: "考试项目、方向、批次、科目、大纲和知识树。",
    section: "admin",
    status: "foundation"
  },
  {
    id: "admin-knowledge",
    href: "/admin/knowledge",
    label: "知识",
    description: "知识节点治理、权重、分类和未归类内容。",
    section: "admin",
    status: "foundation"
  },
  {
    id: "admin-questions",
    href: "/admin/questions",
    label: "题目",
    description: "单选题创建、JSON 导入、编辑、知识点绑定、来源、可见性和审核状态。",
    section: "admin",
    status: "foundation"
  },
  {
    id: "admin-papers",
    href: "/admin/papers",
    label: "试卷",
    description: "试卷创建、筛选、归档隐藏、题目绑定、题序、分区、分值和公开状态。",
    section: "admin",
    status: "foundation"
  },
  {
    id: "admin-materials",
    href: "/admin/materials",
    label: "资料",
    description: "上传资产、抽取任务、来源引用和处理错误。",
    section: "admin",
    status: "foundation"
  },
  {
    id: "admin-ai",
    href: "/admin/ai",
    label: "AI",
    description: "模型预设、任务路由、限制、提示词版本和用量日志。",
    section: "admin",
    status: "foundation"
  },
  {
    id: "admin-jobs",
    href: "/admin/jobs",
    label: "任务",
    description: "数据库队列状态、重试、失败和进度追踪。",
    section: "admin",
    status: "foundation"
  },
  {
    id: "admin-users",
    href: "/admin/users",
    label: "用户",
    description: "用户角色、使用限制、AI 调用量和账号状态。",
    section: "admin",
    status: "foundation"
  },
  {
    id: "admin-audit",
    href: "/admin/audit",
    label: "审计",
    description: "可见性、来源、模型和管理设置变更的追加式事件。",
    section: "admin",
    status: "foundation"
  }
];

export const allRoutes = [...learnerRoutes, ...adminRoutes];

export const routeStatusLabels: Record<RouteItem["status"], string> = {
  foundation: "基础版",
  planned: "规划中"
};

export const sectionLabels: Record<AppSection, string> = {
  learner: "学习端",
  admin: "管理端"
};

export function getRoute(id: string) {
  const route = allRoutes.find((item) => item.id === id);

  if (!route) {
    throw new Error(`Unknown route id: ${id}`);
  }

  return route;
}
