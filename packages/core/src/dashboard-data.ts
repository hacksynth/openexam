export const dashboardMetrics = [
  { label: "今日任务", value: "3", tone: "primary" },
  { label: "待复习错题", value: "12", tone: "danger" },
  { label: "薄弱知识点", value: "5", tone: "teal" },
  { label: "AI 任务", value: "2", tone: "ai" }
] as const;

export const todayTasks = [
  "完成 20 道基础知识练习",
  "重练标记为记忆漏洞的错题",
  "复习数据结构相关知识点"
];

export const weakKnowledgeNodes = [
  "UML 建模",
  "数据库规范化",
  "网络安全基础",
  "算法复杂度",
  "软件测试策略"
];

export const recentJobs = [
  { label: "错题 AI 解析", status: "已完成" },
  { label: "资料题目抽取", status: "排队中" }
];
