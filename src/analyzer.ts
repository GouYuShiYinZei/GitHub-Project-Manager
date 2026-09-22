import type { AnalysisCategory, GitHubRepo, RepoAnalysis, RepoCodeContext, RepoKeyFile } from "./types";

type CategoryRule = {
  id: AnalysisCategory;
  keywords: string[];
};

type SemanticIntent = {
  id: string;
  category: AnalysisCategory;
  projectKindZh: string;
  projectKindEn: string;
  summaryZh: string;
  summaryEn: string;
  signals: string[];
  confidenceBoost: number;
};

type SemanticIntentRule = SemanticIntent & {
  keywords: string[];
  requiredAny?: string[];
};

type PackageJson = {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  bin?: string | Record<string, string>;
};

type DerivedProfile = {
  projectKindZh: string;
  projectKindEn: string;
  frameworkStack: string[];
  architecture: string[];
  keyFiles: string[];
  evidence: string[];
  packageManager: string | null;
  scripts: string[];
  primaryLanguages: string[];
  isPdfTool: boolean;
  intent: SemanticIntent | null;
};

export const CATEGORY_LABELS: Record<AnalysisCategory, string> = {
  ai: "AI / 机器学习",
  frontend: "前端与 UI",
  backend: "后端与 API",
  devtools: "开发工具",
  data: "数据与存储",
  infra: "部署与运维",
  mobile: "移动与桌面",
  docs: "资料与清单",
  testing: "测试与质量",
  media: "图形与媒体",
  productivity: "效率/办公工具",
  general: "通用项目",
};

export const CATEGORY_COLORS: Record<AnalysisCategory, string> = {
  ai: "#7c3aed",
  frontend: "#0891b2",
  backend: "#2563eb",
  devtools: "#475569",
  data: "#16a34a",
  infra: "#dc2626",
  mobile: "#db2777",
  docs: "#ca8a04",
  testing: "#059669",
  media: "#ea580c",
  productivity: "#0d9488",
  general: "#64748b",
};

const CATEGORY_EN_LABELS: Record<AnalysisCategory, string> = {
  ai: "AI / machine learning",
  frontend: "frontend and UI",
  backend: "backend and APIs",
  devtools: "developer tools",
  data: "data and storage",
  infra: "infrastructure and operations",
  mobile: "mobile and desktop",
  docs: "documentation and resource lists",
  testing: "testing and quality",
  media: "graphics and media",
  productivity: "productivity and office tools",
  general: "general open-source projects",
};

const CATEGORY_RULES: CategoryRule[] = [
  {
    id: "productivity",
    keywords: [
      "pdf",
      "office",
      "ocr",
      "file converter",
      "document converter",
      "pdf converter",
      "pdf merger",
      "pdf splitter",
      "pdf compressor",
      "stirling",
      "scanner",
      "spreadsheet",
      "办公",
      "PDF",
      "OCR",
      "文档转换",
      "文件转换",
      "工具箱",
    ],
  },
  {
    id: "ai",
    keywords: [
      "ai",
      "artificial intelligence",
      "machine learning",
      "deep learning",
      "llm",
      "gpt",
      "rag",
      "agent",
      "transformer",
      "diffusion",
      "computer vision",
      "nlp",
      "neural",
      "pytorch",
      "tensorflow",
      "模型",
      "机器学习",
    ],
  },
  {
    id: "frontend",
    keywords: [
      "react",
      "vue",
      "svelte",
      "angular",
      "css",
      "tailwind",
      "component",
      "frontend",
      "design system",
      "web app",
      "vite",
      "nextjs",
      "next.js",
      "前端",
      "组件",
    ],
  },
  {
    id: "backend",
    keywords: [
      "api",
      "backend",
      "server",
      "framework",
      "express",
      "fastapi",
      "django",
      "spring",
      "rails",
      "graphql",
      "rpc",
      "auth",
      "proxy",
      "api gateway",
      "compatible api",
      "axum",
      "actix-web",
      "gin-gonic",
      "后端",
      "服务端",
    ],
  },
  {
    id: "devtools",
    keywords: [
      "cli",
      "developer tool",
      "sdk",
      "library",
      "toolkit",
      "compiler",
      "lint",
      "format",
      "debug",
      "terminal",
      "package manager",
      "开发工具",
      "命令行",
    ],
  },
  {
    id: "data",
    keywords: [
      "database",
      "postgres",
      "mysql",
      "redis",
      "sqlite",
      "storage",
      "analytics",
      "etl",
      "pipeline",
      "query",
      "vector database",
      "数据",
      "数据库",
    ],
  },
  {
    id: "infra",
    keywords: [
      "kubernetes",
      "terraform",
      "ansible",
      "helm",
      "devops",
      "deployment platform",
      "observability",
      "monitoring",
      "ci/cd",
      "serverless",
      "infrastructure",
      "运维",
      "基础设施",
    ],
  },
  {
    id: "mobile",
    keywords: [
      "ios",
      "android",
      "react native",
      "flutter",
      "electron",
      "desktop",
      "tauri",
      "swift",
      "kotlin",
      "移动",
      "桌面",
    ],
  },
  {
    id: "docs",
    keywords: [
      "awesome",
      "curated list",
      "resources",
      "guide",
      "book",
      "tutorial",
      "learning",
      "roadmap",
      "examples",
      "ranking",
      "rankings",
      "top list",
      "leaderboard",
      "榜单",
      "排行榜",
      "资料",
      "教程",
      "清单",
    ],
  },
  {
    id: "testing",
    keywords: [
      "test",
      "testing",
      "e2e",
      "playwright",
      "cypress",
      "jest",
      "vitest",
      "benchmark",
      "quality",
      "测试",
    ],
  },
  {
    id: "media",
    keywords: [
      "graphics",
      "game",
      "audio",
      "video",
      "canvas",
      "webgl",
      "three.js",
      "image",
      "visualization",
      "chart",
      "图像",
      "视频",
      "可视化",
    ],
  },
];

const SEMANTIC_INTENT_RULES: SemanticIntentRule[] = [
  {
    id: "codex-auth-switcher",
    category: "devtools",
    projectKindZh: "Codex 账号/认证快照切换工具",
    projectKindEn: "Codex account and auth snapshot switcher",
    summaryZh:
      "用于保存、恢复或切换 Codex 的认证状态/账号快照，适合需要在多个 Codex 账号、不同登录态或不同工作环境之间快速切换的人使用；它的核心价值是管理本机 Codex 凭据状态，而不是提供通用后端认证服务。",
    summaryEn:
      "A local utility for saving, restoring, or switching Codex authentication snapshots. It is useful when you need to move between multiple Codex accounts, login states, or work contexts; the core purpose is local Codex credential-state management rather than a generic backend auth service.",
    signals: ["Codex", "账号切换", "认证快照"],
    confidenceBoost: 12,
    requiredAny: ["codex"],
    keywords: [
      "codex-auth-snap",
      "codex auth snap",
      "codex auth",
      "codex account",
      "codex accounts",
      "codex login",
      "auth snapshot",
      "authentication snapshot",
      "switch accounts",
      "account switch",
      "multiple accounts",
      "credentials snapshot",
      "token snapshot",
      "账号切换",
      "认证快照",
    ],
  },
  {
    id: "agent-memory-palace",
    category: "ai",
    projectKindZh: "AI Agent 记忆结构/长期记忆系统",
    projectKindEn: "AI agent memory structure and long-term memory system",
    summaryZh:
      "围绕大模型 Agent 的长期记忆组织方式展开，重点不是普通数据库或笔记工具，而是把记忆按可检索、可更新、可用于推理的结构保存下来，帮助 Agent 在跨会话任务中保留上下文、事实和经验。",
    summaryEn:
      "An agent-memory project focused on organizing long-term memory for LLM agents. Rather than being a generic database or note app, it stores retrievable and updateable memory structures so agents can preserve context, facts, and experience across sessions.",
    signals: ["Agent Memory", "长期记忆", "记忆结构"],
    confidenceBoost: 14,
    keywords: [
      "mempalace",
      "mem palace",
      "memory palace",
      "agent memory",
      "agentic memory",
      "long-term memory",
      "long term memory",
      "persistent memory",
      "memory structure",
      "memory architecture",
      "verbatim memory",
      "episodic memory",
      "semantic memory",
      "retrieval memory",
      "大模型记忆",
      "agent 记忆",
      "长期记忆",
      "记忆结构",
    ],
  },
  {
    id: "agent-context-skills",
    category: "ai",
    projectKindZh: "Agent 文本处理/上下文工程 Skill 集",
    projectKindEn: "Agent text-processing and context-engineering skill set",
    summaryZh:
      "给 Agent 使用的 skill/提示资产集合，主要面向文本内容处理、上下文整理、压缩、提取、重写或结构化等工作流。它更像一组可复用的 Agent 能力模块，而不是传统应用项目。",
    summaryEn:
      "A collection of skills or prompt assets for agents, focused on text-content handling and context-engineering workflows such as organizing, compressing, extracting, rewriting, or structuring information. It behaves more like reusable agent capability modules than a conventional application.",
    signals: ["Agent Skills", "Context Engineering", "文本处理"],
    confidenceBoost: 14,
    requiredAny: ["agent skill", "skill.md", "context engineering", "context compression", "context extraction"],
    keywords: [
      "agent-skills-for-context",
      "agent skills for context",
      "agent skills",
      "skills for context",
      "context engineering",
      "context management",
      "context processing",
      "context compression",
      "context extraction",
      "text processing",
      "content processing",
      "prompt skill",
      "skill.md",
      "agent skill",
      "文本处理",
      "上下文工程",
      "上下文处理",
    ],
  },
  {
    id: "codex-skill-package",
    category: "devtools",
    projectKindZh: "Codex/Agent Skill 包",
    projectKindEn: "Codex or agent skill package",
    summaryZh:
      "这是给 Codex 或其他 Agent 运行时加载的 skill 包，通常通过 SKILL.md 描述能力和触发方式，用来扩展 Agent 在某一类任务上的工作流程。",
    summaryEn:
      "A skill package intended to be loaded by Codex or other agent runtimes. It typically uses SKILL.md to describe capabilities and trigger conditions, extending an agent workflow for a specific task family.",
    signals: ["SKILL.md", "Agent Skill"],
    confidenceBoost: 8,
    requiredAny: ["skill.md", ".codex/skills", "codex skill", "agent skill"],
    keywords: ["skill.md", ".codex/skills", "codex skill", "agent skill"],
  },
];

const USAGE_HEADINGS = [
  "install",
  "installation",
  "setup",
  "getting started",
  "quick start",
  "quickstart",
  "usage",
  "example",
  "examples",
  "running",
  "development",
  "build",
  "docker",
  "安装",
  "使用",
  "快速开始",
  "快速上手",
  "入门",
  "运行",
  "示例",
  "开发",
  "构建",
];

const COMMAND_PATTERNS = [
  /^git\s+/i,
  /^npm\s+/i,
  /^npx\s+/i,
  /^pnpm\s+/i,
  /^yarn\s+/i,
  /^bun\s+/i,
  /^node\s+/i,
  /^deno\s+/i,
  /^python\s+/i,
  /^python3\s+/i,
  /^pip\s+/i,
  /^pipx\s+/i,
  /^uv\s+/i,
  /^poetry\s+/i,
  /^go\s+/i,
  /^cargo\s+/i,
  /^docker\s+/i,
  /^docker-compose\s+/i,
  /^make\s*/i,
  /^cmake\s+/i,
  /^gradle\s+/i,
  /^\.\/gradlew/i,
  /^mvn\s+/i,
  /^composer\s+/i,
  /^gem\s+/i,
  /^bundle\s+/i,
  /^java\s+-jar/i,
];

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanMarkdown(value: string) {
  return compact(
    value
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/^#+\s*/gm, "")
      .replace(/^[-*+]\s+/gm, ""),
  );
}

function normalizeReadmeText(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  const deduped: string[] = [];
  for (const word of words) {
    const recent = deduped.slice(-3);
    if (recent.includes(word) && /^[A-Za-z+#.-]{2,24}$/.test(word)) continue;
    deduped.push(word);
  }

  return compact(deduped.join(" "))
    .replace(/\bAll Language\b(?:\s+[A-Za-z+#.-]{1,24}){3,}/gi, " ")
    .replace(/\b(JavaScript|TypeScript|Python|Java|Go|Rust|Vue|React|CSS|HTML)\b(?:\s+\1\b){1,}/gi, "$1")
    .replace(/\s+([，。；：,.])/g, "$1");
}

function isNoisyReadmeBlock(block: string) {
  const plain = cleanMarkdown(block).toLowerCase();
  const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const bulletLines = lines.filter((line) => /^[-*+]\s+|^\d+\.\s+/.test(line)).length;
  const shortBulletRatio = bulletLines ? lines.filter((line) => /^[-*+]\s+.{1,36}$/.test(line)).length / bulletLines : 0;

  if (!plain) return true;
  if (plain.includes("shields.io") || plain.includes("badgen.net")) return true;
  if (plain.includes("| ---") || plain.includes("目录") || plain.includes("table of contents")) return true;
  if (plain.includes("all language") || plain.includes("中文总榜") || plain.includes("软件类 资料类")) return true;
  if (bulletLines >= 8 && shortBulletRatio > 0.65) return true;
  if ((plain.match(/\b(javascript|typescript|python|java|vue|go|rust)\b/g) || []).length > 8) return true;
  return false;
}

function includesAny(value: string, keywords: string[]) {
  const lower = value.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function hasCjk(value: string | null | undefined) {
  return Boolean(value && /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/.test(value));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordHit(text: string, keyword: string) {
  const normalized = keyword.toLowerCase();
  if (/^[a-z0-9][a-z0-9 +#./-]*$/.test(normalized)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalized)}([^a-z0-9]|$)`, "i").test(text);
  }
  return text.includes(normalized);
}

function addUnique(target: string[], value: string | null | undefined) {
  if (!value) return;
  if (!target.includes(value)) target.push(value);
}

function getReadmeTitle(readme: string | null) {
  if (!readme) return null;
  const match = readme.match(/^#\s+(.+)$/m);
  return match ? cleanMarkdown(match[1]) : null;
}

function getFirstParagraph(readme: string | null) {
  if (!readme) return null;

  const blocks = readme
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const paragraph = blocks.find((block) => {
    const plain = normalizeReadmeText(cleanMarkdown(block));
    return (
      plain.length > 60 &&
      !block.startsWith("#") &&
      !block.includes("shields.io") &&
      !block.includes("| ---") &&
      !block.startsWith("<p align") &&
      !isNoisyReadmeBlock(block)
    );
  });

  return paragraph ? normalizeReadmeText(cleanMarkdown(paragraph)).slice(0, 360) : null;
}

function getReadmeFeatureSummary(readme: string | null) {
  if (!readme) return null;

  const normalized = readme.replace(/\r\n/g, "\n");
  const title = getReadmeTitle(readme);
  const intro = getFirstParagraph(readme);
  const headingMatch = normalized.match(/^#{2,4}\s+(features?|overview|what is|why|capabilities|功能|特性|亮点|概览|介绍)\b.*$/im);
  const bullets: string[] = [];

  if (headingMatch?.index !== undefined) {
    const sectionStart = headingMatch.index + headingMatch[0].length;
    const nextHeading = normalized.slice(sectionStart).search(/\n#{1,4}\s+/);
    const sectionBody = normalized.slice(sectionStart, nextHeading >= 0 ? sectionStart + nextHeading : sectionStart + 2200);

    for (const line of sectionBody.split("\n")) {
      const trimmed = line.trim();
      if (!/^[-*+]\s+/.test(trimmed) && !/^\d+\.\s+/.test(trimmed)) continue;
      const cleaned = normalizeReadmeText(cleanMarkdown(trimmed.replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, "")));
      if (cleaned.length >= 8 && cleaned.length <= 180 && !isNoisyReadmeBlock(cleaned)) bullets.push(cleaned);
      if (bullets.length >= 4) break;
    }
  }

  const parts = [
    title ? `README 标题「${title}」` : null,
    intro,
    bullets.length ? `主要功能包括：${bullets.join("；")}` : null,
  ].filter(Boolean);

  return parts.length ? parts.join("。") : null;
}

function getReadmeFeatureSummaryEn(readme: string | null) {
  if (!readme) return null;

  const normalized = readme.replace(/\r\n/g, "\n");
  const title = getReadmeTitle(readme);
  const intro = getFirstParagraph(readme);
  const headingMatch = normalized.match(/^#{2,4}\s+(features?|overview|what is|why|capabilities|功能|特性|亮点|概览|介绍)\b.*$/im);
  const bullets: string[] = [];

  if (headingMatch?.index !== undefined) {
    const sectionStart = headingMatch.index + headingMatch[0].length;
    const nextHeading = normalized.slice(sectionStart).search(/\n#{1,4}\s+/);
    const sectionBody = normalized.slice(sectionStart, nextHeading >= 0 ? sectionStart + nextHeading : sectionStart + 2200);

    for (const line of sectionBody.split("\n")) {
      const trimmed = line.trim();
      if (!/^[-*+]\s+/.test(trimmed) && !/^\d+\.\s+/.test(trimmed)) continue;
      const cleaned = normalizeReadmeText(cleanMarkdown(trimmed.replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, "")));
      if (cleaned.length >= 8 && cleaned.length <= 180 && !isNoisyReadmeBlock(cleaned)) bullets.push(cleaned);
      if (bullets.length >= 4) break;
    }
  }

  const parts = [
    title ? `README title: "${title}"` : null,
    intro,
    bullets.length ? `Key capabilities: ${bullets.join("; ")}` : null,
  ].filter(Boolean);

  return parts.length ? parts.join(". ") : null;
}

function getFile(context: RepoCodeContext | null | undefined, nameOrPath: string) {
  return context?.keyFiles.find((file) => file.path === nameOrPath || file.path.endsWith(`/${nameOrPath}`) || file.path.split("/").pop() === nameOrPath) || null;
}

function parsePackageJson(context: RepoCodeContext | null | undefined): PackageJson | null {
  const file = getFile(context, "package.json");
  if (!file) return null;
  try {
    return JSON.parse(file.content) as PackageJson;
  } catch {
    return null;
  }
}

function getAllPackageDeps(packageJson: PackageJson | null) {
  if (!packageJson) return [];
  return Object.keys({
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
    ...(packageJson.peerDependencies || {}),
  }).map((dependency) => dependency.toLowerCase());
}

function getContextCorpus(repo: GitHubRepo, readme: string | null, context: RepoCodeContext | null | undefined) {
  const keyFileText = context?.keyFiles.map((file) => `${file.path}\n${file.content.slice(0, 12000)}`).join("\n") || "";
  return {
    identity: [repo.name, repo.full_name, repo.description, repo.language, repo.homepage, ...(repo.topics || [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    readme: (readme || "").slice(0, 8000).toLowerCase(),
    code: [
      ...(context?.files || []),
      ...(context?.directories || []),
      Object.keys(context?.languageBytes || {}).join(" "),
      keyFileText,
    ]
      .join(" ")
      .toLowerCase(),
  };
}

function getIntentCorpus(repo: GitHubRepo, readme: string | null, context: RepoCodeContext | null | undefined) {
  const title = getReadmeTitle(readme);
  const paragraph = getFirstParagraph(readme);
  const keyFileHints = context?.keyFiles
    .map((file) => {
      const lowValue = /lock|package-lock|yarn\.lock|pnpm-lock/i.test(file.path);
      return lowValue ? file.path : `${file.path}\n${file.content.slice(0, 6000)}`;
    })
    .join("\n");

  return [
    repo.name,
    repo.full_name,
    repo.description,
    repo.homepage,
    repo.language,
    ...(repo.topics || []),
    title,
    paragraph,
    readme?.slice(0, 7000),
    ...(context?.files || []).slice(0, 160),
    ...(context?.directories || []).slice(0, 80),
    keyFileHints,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function detectSemanticIntent(repo: GitHubRepo, readme: string | null, context: RepoCodeContext | null | undefined): SemanticIntent | null {
  // Supporting skills and dependencies do not define the repository's product.
  const corpus = [repo.name, repo.description, ...(repo.topics || []), getFirstParagraph(readme)].filter(Boolean).join("\n").toLowerCase();
  const matches = SEMANTIC_INTENT_RULES.map((rule) => {
    const requiredHit = !rule.requiredAny || rule.requiredAny.some((keyword) => corpus.includes(keyword.toLowerCase()));
    if (!requiredHit) return { rule, score: 0 };
    if (rule.id === "agent-context-skills" && !/context|文本处理|上下文/i.test(corpus)) return { rule, score: 0 };

    const score = rule.keywords.reduce((total, keyword) => {
      const normalized = keyword.toLowerCase();
      if (!corpus.includes(normalized)) return total;
      const identityBoost = [repo.name, repo.full_name, repo.description, ...(repo.topics || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized)
        ? 4
        : 0;
      return total + 2 + Math.min(4, Math.floor(normalized.length / 6)) + identityBoost;
    }, 0);

    return { rule, score };
  }).sort((a, b) => b.score - a.score);

  const best = matches[0];
  if (!best || best.score < 5) return null;

  const { keywords: _keywords, requiredAny: _requiredAny, ...intent } = best.rule;
  return intent;
}

function scoreKeywords(text: string, keywords: string[], weight: number) {
  return keywords.reduce((score, keyword) => {
    const normalized = keyword.toLowerCase();
    return keywordHit(text, normalized) ? score + weight + Math.min(3, Math.floor(normalized.length / 7)) : score;
  }, 0);
}

function hasInfraProductSignal(repo: GitHubRepo, context: RepoCodeContext | null | undefined) {
  const corpus = [
    repo.name,
    repo.description,
    ...(repo.topics || []),
    ...(context?.files || []).slice(0, 80),
  ]
    .join(" ")
    .toLowerCase();

  return includesAny(corpus, [
    "kubernetes",
    "terraform",
    "ansible",
    "helm",
    "operator",
    "observability",
    "monitoring",
    "devops",
    "infrastructure",
    "ci/cd",
  ]);
}

function isAwesomeList(repo: GitHubRepo) {
  const corpus = [repo.name, repo.full_name, repo.description, ...(repo.topics || [])].filter(Boolean).join(" ").toLowerCase();
  return (
    repo.name.toLowerCase().startsWith("awesome-") ||
    repo.topics?.includes("awesome") ||
    includesAny(corpus, ["curated list", "resource list", "top list", "ranking", "leaderboard", "榜单", "排行榜", "资源清单", "资料库"])
  );
}

function isPdfOrOfficeTool(repo: GitHubRepo, readme: string | null, context: RepoCodeContext | null | undefined) {
  const identity = [
    repo.name,
    repo.description,
    ...(repo.topics || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const productText = `${identity} ${getFirstParagraph(readme) || ""}`;
  const documentPurpose = /\b(pdf|office|ocr|docx|xlsx|pptx)\b|文档转换|文件转换/i.test(productText);
  const operation = /convert|merge|split|compress|edit|process|tool|suite|extract|转换|合并|拆分|压缩|编辑|处理|工具/i.test(productText);
  return documentPurpose && operation;
}

function classify(repo: GitHubRepo, readme: string | null, context: RepoCodeContext | null | undefined): AnalysisCategory {
  if (isAwesomeList(repo)) return "docs";
  if (/\b(userscript|tampermonkey|violentmonkey|chrome-extension|browser extension)\b/i.test([repo.description, ...(repo.topics || [])].join(" "))) return "frontend";
  const intent = detectSemanticIntent(repo, readme, context);
  if (intent) return intent.category;
  if (isAwesomeList(repo)) return "docs";
  if (isPdfOrOfficeTool(repo, readme, context)) return "productivity";

  const corpus = getContextCorpus(repo, readme, context);
  const scores = CATEGORY_RULES.map((rule) => {
    let score = 0;
    score += scoreKeywords(corpus.identity, rule.keywords, 5);
    score += scoreKeywords(corpus.code, rule.keywords, 1);
    score += scoreKeywords(corpus.readme, rule.keywords, 1);

    if (rule.id === "infra" && !hasInfraProductSignal(repo, context)) {
      score = Math.max(0, score - 8);
    }

    return { id: rule.id, score };
  }).sort((a, b) => b.score - a.score);

  return scores[0]?.score > 0 ? scores[0].id : "general";
}

function languageShares(context: RepoCodeContext | null | undefined, fallback: string | null) {
  const entries = Object.entries(context?.languageBytes || {});
  const total = entries.reduce((sum, [, bytes]) => sum + bytes, 0);

  if (!entries.length || total <= 0) {
    return fallback ? [fallback] : [];
  }

  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([language, bytes]) => `${language} ${Math.round((bytes / total) * 100)}%`);
}

function detectPackageManager(context: RepoCodeContext | null | undefined) {
  const files = context?.files || [];
  if (files.includes("pnpm-lock.yaml")) return "pnpm";
  if (files.includes("yarn.lock")) return "Yarn";
  if (files.includes("bun.lockb")) return "Bun";
  if (files.includes("package-lock.json")) return "npm";
  if (files.includes("poetry.lock")) return "Poetry";
  if (files.includes("uv.lock")) return "uv";
  return null;
}

function detectFrameworks(repo: GitHubRepo, context: RepoCodeContext | null | undefined, packageJson: PackageJson | null) {
  const frameworks: string[] = [];
  const deps = getAllPackageDeps(packageJson);
  const allText = [
    ...(context?.files || []),
    ...(context?.directories || []),
    ...(context?.keyFiles || []).map((file) => `${file.path}\n${file.content.slice(0, 25000)}`),
    repo.language,
  ]
    .join("\n")
    .toLowerCase();

  const hasDep = (name: string) => deps.includes(name);
  const hasText = (value: string) => keywordHit(allText, value);

  if (hasDep("next")) addUnique(frameworks, "Next.js");
  if (hasDep("react")) addUnique(frameworks, "React");
  if (hasDep("vue")) addUnique(frameworks, "Vue");
  if (hasDep("svelte")) addUnique(frameworks, "Svelte");
  if (hasDep("@angular/core")) addUnique(frameworks, "Angular");
  if (hasDep("vite") || hasText("vite.config")) addUnique(frameworks, "Vite");
  if (hasDep("tailwindcss") || hasText("tailwind.config")) addUnique(frameworks, "Tailwind CSS");
  if (hasDep("electron")) addUnique(frameworks, "Electron");
  if (hasDep("@tauri-apps/api") || hasText("tauri.conf")) addUnique(frameworks, "Tauri");
  if (hasDep("express")) addUnique(frameworks, "Express");
  if (hasDep("fastify")) addUnique(frameworks, "Fastify");
  if (hasDep("@nestjs/core")) addUnique(frameworks, "NestJS");
  if (hasDep("prisma")) addUnique(frameworks, "Prisma");
  if (hasText("fastapi")) addUnique(frameworks, "FastAPI");
  if (hasText("django")) addUnique(frameworks, "Django");
  if (hasText("flask")) addUnique(frameworks, "Flask");
  if (hasText("streamlit")) addUnique(frameworks, "Streamlit");
  if (hasText("gradio")) addUnique(frameworks, "Gradio");
  if (hasText("torch") || hasText("pytorch")) addUnique(frameworks, "PyTorch");
  if (hasText("tensorflow")) addUnique(frameworks, "TensorFlow");
  if (hasText("spring-boot") || hasText("org.springframework.boot")) addUnique(frameworks, "Spring Boot");
  if (hasText("pdfbox")) addUnique(frameworks, "Apache PDFBox");
  if (hasText("itext")) addUnique(frameworks, "iText");
  if (hasText("gin-gonic") || hasText("github.com/gin-gonic/gin")) addUnique(frameworks, "Gin");
  if (hasText("spf13/cobra")) addUnique(frameworks, "Cobra CLI");
  if (hasText("actix-web")) addUnique(frameworks, "Actix Web");
  if (hasText("axum")) addUnique(frameworks, "Axum");
  if (hasText("clap")) addUnique(frameworks, "Clap CLI");
  if (hasText("dockerfile") || (context?.files || []).some((file) => file.endsWith("Dockerfile"))) addUnique(frameworks, "Docker");
  if ((context?.files || []).some((file) => /compose\.ya?ml$|docker-compose\.ya?ml$/i.test(file))) addUnique(frameworks, "Docker Compose");

  return frameworks;
}

function detectArchitecture(context: RepoCodeContext | null | undefined, packageJson: PackageJson | null, frameworks: string[]) {
  const architecture: string[] = [];
  const files = context?.files || [];
  const directories = context?.directories || [];
  const hasDir = (value: string) => directories.includes(value) || directories.some((dir) => dir.startsWith(`${value}/`));
  const hasFile = (pattern: RegExp) => files.some((file) => pattern.test(file));

  if (hasDir("src")) addUnique(architecture, "src 源码目录");
  if (hasDir("app")) addUnique(architecture, "app 路由/应用目录");
  if (hasDir("packages")) addUnique(architecture, "packages 多包结构");
  if (hasDir("cmd") || hasFile(/^cmd\/[^/]+\/main\.go$/)) addUnique(architecture, "cmd 命令入口");
  if (hasDir("internal")) addUnique(architecture, "internal 内部模块");
  if (hasDir("server") || hasDir("api")) addUnique(architecture, "server/api 服务层");
  if (hasDir("client") || hasDir("web")) addUnique(architecture, "client/web 前端层");
  if (hasDir("docs")) addUnique(architecture, "docs 文档");
  if (hasDir("test") || hasDir("tests") || hasFile(/(spec|test)\.(ts|tsx|js|jsx|py|go|rs)$/)) addUnique(architecture, "测试目录");
  if (frameworks.includes("Docker") || frameworks.includes("Docker Compose")) addUnique(architecture, "容器化运行支持");
  if (packageJson?.scripts) {
    const scripts = Object.keys(packageJson.scripts).filter((script) => ["dev", "start", "build", "test", "lint"].includes(script));
    if (scripts.length) addUnique(architecture, `npm scripts: ${scripts.join(", ")}`);
  }

  return architecture.slice(0, 5);
}

function architectureToEnglish(items: string[]) {
  const map = new Map<string, string>([
    ["src 源码目录", "source directory"],
    ["app 路由/应用目录", "app or routing directory"],
    ["packages 多包结构", "multi-package layout"],
    ["cmd 命令入口", "command entrypoints"],
    ["internal 内部模块", "internal modules"],
    ["server/api 服务层", "server or API layer"],
    ["client/web 前端层", "client or web layer"],
    ["docs 文档", "documentation directory"],
    ["测试目录", "test directory"],
    ["容器化运行支持", "containerized runtime support"],
  ]);

  return items.map((item) => {
    if (map.has(item)) return map.get(item)!;
    if (item.startsWith("npm scripts:")) return item;
    return item.replace(/源码目录/g, "source directory").replace(/文档/g, "docs");
  });
}

function detectProjectKind(
  repo: GitHubRepo,
  readme: string | null,
  context: RepoCodeContext | null | undefined,
  category: AnalysisCategory,
  packageJson: PackageJson | null,
  frameworks: string[],
  isPdfTool: boolean,
) {
  const files = context?.files || [];
  const corpus = [
    repo.name,
    repo.description,
    ...(repo.topics || []),
    readme?.slice(0, 3000),
    files.slice(0, 80).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (isAwesomeList(repo)) return ["资源清单/学习资料", "curated resource list"] as const;
  if (isPdfTool) return ["PDF/文档处理工具", "PDF/document utility"] as const;
  if (/\b(userscript|tampermonkey|violentmonkey)\b/i.test(corpus)) return ["浏览器用户脚本", "browser userscript"] as const;
  if (/\b(chrome-extension|browser extension)\b/i.test(corpus)) return ["浏览器扩展", "browser extension"] as const;
  if (frameworks.some((item) => ["Electron", "Tauri"].includes(item)) || category === "mobile") return ["桌面/移动应用", "desktop or mobile application"] as const;
  if (packageJson?.bin || ["cli", "command line", "command-line", "terminal"].some((word) => keywordHit([repo.name, repo.description, ...(repo.topics || [])].join(" ").toLowerCase(), word))) return ["命令行工具", "command-line tool"] as const;
  if (frameworks.some((item) => ["React", "Vue", "Svelte", "Angular", "Next.js", "Vite"].includes(item))) return ["Web 应用/前端项目", "web application or frontend project"] as const;
  if (frameworks.some((item) => ["FastAPI", "Django", "Flask", "Express", "Fastify", "NestJS", "Spring Boot", "Gin", "Actix Web", "Axum"].includes(item))) return ["后端服务/API", "backend service or API"] as const;
  if (category === "ai") return ["AI/模型应用", "AI or machine-learning project"] as const;
  if (category === "data") return ["数据系统/存储组件", "data or storage system"] as const;
  if (category === "infra" && hasInfraProductSignal(repo, context)) return ["基础设施/部署组件", "infrastructure or deployment component"] as const;
  if (category === "devtools" || includesAny(corpus, ["sdk", "library", "framework", "plugin"])) return ["开发工具/库", "developer tool or library"] as const;
  if (category === "testing") return ["测试/质量工具", "testing or quality tool"] as const;
  if (category === "media") return ["图形/媒体项目", "graphics or media project"] as const;
  return ["开源项目", "open-source project"] as const;
}

function deriveProfile(repo: GitHubRepo, readme: string | null, context: RepoCodeContext | null | undefined, category: AnalysisCategory): DerivedProfile {
  const packageJson = parsePackageJson(context);
  const frameworks = detectFrameworks(repo, context, packageJson);
  const isPdfTool = isPdfOrOfficeTool(repo, readme, context);
  const intent = detectSemanticIntent(repo, readme, context);
  const [projectKindZh, projectKindEn] = intent
    ? ([intent.projectKindZh, intent.projectKindEn] as const)
    : detectProjectKind(repo, readme, context, category, packageJson, frameworks, isPdfTool);
  const packageManager = detectPackageManager(context);
  const scripts = packageJson?.scripts
    ? Object.entries(packageJson.scripts)
        .filter(([name]) => ["dev", "start", "build", "test", "lint", "serve", "preview"].includes(name))
        .map(([name, command]) => `${name}: ${command}`)
        .slice(0, 6)
    : [];

  const keyFiles = (context?.keyFiles || []).map((file) => file.path).slice(0, 8);
  const primaryLanguages = languageShares(context, repo.language);
  const architecture = detectArchitecture(context, packageJson, frameworks);
  const evidence: string[] = [];

  if (primaryLanguages.length) addUnique(evidence, `语言占比：${primaryLanguages.join(", ")}`);
  if (intent) addUnique(evidence, `语义意图：${intent.projectKindZh}`);
  if (frameworks.length) addUnique(evidence, `关键栈：${frameworks.slice(0, 4).join(", ")}`);
  if (keyFiles.length) addUnique(evidence, `关键文件：${keyFiles.slice(0, 4).join(", ")}`);
  if (context?.truncated) addUnique(evidence, "GitHub 文件树被截断，结论仅基于可读取部分");
  if (context?.error) addUnique(evidence, `代码读取提示：${context.error}`);

  return {
    projectKindZh,
    projectKindEn,
    frameworkStack: frameworks.slice(0, 10),
    architecture,
    keyFiles,
    evidence,
    packageManager,
    scripts,
    primaryLanguages,
    isPdfTool,
    intent,
  };
}

function extractSections(readme: string) {
  const normalized = readme.replace(/\r\n/g, "\n");
  const headingRegex = /^(#{1,4})\s+(.+)$/gm;
  const headings: Array<{ title: string; index: number; end: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(normalized)) !== null) {
    headings.push({
      title: cleanMarkdown(match[2]).toLowerCase(),
      index: match.index,
      end: headingRegex.lastIndex,
    });
  }

  return headings.map((heading, index) => {
    const next = headings[index + 1]?.index ?? normalized.length;
    return {
      title: heading.title,
      body: normalized.slice(heading.end, next).trim(),
    };
  });
}

function isUsageHeading(title: string) {
  return USAGE_HEADINGS.some((keyword) => title.includes(keyword));
}

function extractCodeBlocks(markdown: string) {
  const commands: string[] = [];
  const codeBlockRegex = /```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    const lines = match[1]
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(\$|>|PS>)\s*/, "").trim())
      .filter(Boolean);

    for (const line of lines) {
      const withoutComment = line.replace(/\s+#.*$/, "").trim();
      if (COMMAND_PATTERNS.some((pattern) => pattern.test(withoutComment))) {
        commands.push(withoutComment);
      }
    }
  }

  return Array.from(new Set(commands)).slice(0, 10);
}

function summarizeUsageText(markdown: string) {
  const cleaned = cleanMarkdown(markdown)
    .replace(/\b(copy|paste)\b/gi, "")
    .slice(0, 620);

  if (!cleaned) return null;
  return cleaned.length > 600 ? `${cleaned.slice(0, 600)}...` : cleaned;
}

function extractUsage(readme: string | null) {
  if (!readme) {
    return { usage: [] as string[], usageEn: [] as string[], commands: [] as string[] };
  }

  const sections = extractSections(readme).filter((section) => isUsageHeading(section.title));
  const targetMarkdown = sections.length > 0 ? sections.slice(0, 4).map((section) => section.body).join("\n\n") : readme.slice(0, 6000);
  const commands = extractCodeBlocks(targetMarkdown);
  const usage: string[] = [];
  const usageEn: string[] = [];

  if (commands.length) {
    usage.push("README 中识别到这些可执行命令：");
    usageEn.push("Commands detected from the README:");
    commands.slice(0, 6).forEach((command) => {
      usage.push(command);
      usageEn.push(command);
    });
  }

  if (sections.length) {
    const summary = summarizeUsageText(sections[0].body);
    if (summary) {
      usage.push(`README 使用说明摘要：${summary}`);
      usageEn.push(
        hasCjk(summary)
          ? "The README contains setup or usage notes; see it for the exact steps."
          : `README usage section summary: ${summary}`,
      );
    }
  }

  return {
    usage: Array.from(new Set(usage)).slice(0, 8),
    usageEn: Array.from(new Set(usageEn)).slice(0, 8),
    commands,
  };
}

function inferUsage(repo: GitHubRepo, context: RepoCodeContext | null | undefined, profile: DerivedProfile) {
  const language = repo.language?.toLowerCase();
  const base = [`git clone ${repo.html_url}.git`, `cd ${repo.name}`];
  const zh = [...base];
  const en = [...base];
  const files = context?.files || [];
  const packageManager = profile.packageManager?.toLowerCase();
  const hasFile = (name: string) => files.includes(name);

  if (profile.frameworkStack.includes("Docker Compose") || hasFile("docker-compose.yml") || hasFile("compose.yml")) {
    zh.push("docker compose up");
    en.push("docker compose up");
    return { usage: zh, usageEn: en };
  }

  if (profile.frameworkStack.includes("Docker") || files.some((file) => file.endsWith("Dockerfile"))) {
    zh.push("docker build -t app .", "docker run --rm -p 8080:8080 app");
    en.push("docker build -t app .", "docker run --rm -p 8080:8080 app");
    return { usage: zh, usageEn: en };
  }

  if (hasFile("package.json")) {
    const install = packageManager === "pnpm" ? "pnpm install" : packageManager === "yarn" ? "yarn install" : packageManager === "bun" ? "bun install" : "npm install";
    zh.push(install);
    en.push(install);
    const scriptNames = profile.scripts.map((script) => script.split(":")[0]);
    if (scriptNames.includes("dev")) {
      const command = packageManager === "pnpm" ? "pnpm dev" : packageManager === "yarn" ? "yarn dev" : packageManager === "bun" ? "bun run dev" : "npm run dev";
      zh.push(command);
      en.push(command);
    } else if (scriptNames.includes("start")) {
      const command = packageManager === "pnpm" ? "pnpm start" : packageManager === "yarn" ? "yarn start" : packageManager === "bun" ? "bun run start" : "npm start";
      zh.push(command);
      en.push(command);
    }
    return { usage: zh, usageEn: en };
  }

  if (hasFile("pyproject.toml") || hasFile("requirements.txt") || language === "python") {
    zh.push("python -m venv .venv");
    zh.push(hasFile("requirements.txt") ? "pip install -r requirements.txt" : "pip install -e .");
    zh.push("查看 README 中的启动入口，常见为 python main.py 或对应 CLI 命令");
    en.push("python -m venv .venv");
    en.push(hasFile("requirements.txt") ? "pip install -r requirements.txt" : "pip install -e .");
    en.push("Check the README for the actual entrypoint, often python main.py or a CLI command.");
    return { usage: zh, usageEn: en };
  }

  if (hasFile("go.mod") || language === "go") {
    zh.push("go mod download", "go run .");
    en.push("go mod download", "go run .");
    return { usage: zh, usageEn: en };
  }

  if (hasFile("Cargo.toml") || language === "rust") {
    zh.push("cargo run");
    en.push("cargo run");
    return { usage: zh, usageEn: en };
  }

  if (hasFile("build.gradle") || hasFile("build.gradle.kts") || language === "java") {
    zh.push("./gradlew bootRun 或 ./gradlew build");
    en.push("./gradlew bootRun or ./gradlew build");
    return { usage: zh, usageEn: en };
  }

  if (hasFile("pom.xml")) {
    zh.push("mvn install", "mvn spring-boot:run 或 java -jar target/*.jar");
    en.push("mvn install", "mvn spring-boot:run or java -jar target/*.jar");
    return { usage: zh, usageEn: en };
  }

  zh.push("查看 README 的 Installation、Usage、Examples 或 Release 章节");
  en.push("Check the README sections for Installation, Usage, Examples, or Releases.");
  return { usage: zh, usageEn: en };
}

function getSignals(repo: GitHubRepo, category: AnalysisCategory, readme: string | null, context: RepoCodeContext | null | undefined, profile: DerivedProfile) {
  const signals = new Set<string>();

  if (profile.intent) {
    profile.intent.signals.forEach((signal) => signals.add(signal));
  }
  if (repo.language) signals.add(repo.language);
  profile.frameworkStack.slice(0, 4).forEach((framework) => signals.add(framework));
  if (profile.packageManager) signals.add(profile.packageManager);
  if (repo.topics?.length) repo.topics.slice(0, 4).forEach((topic) => signals.add(topic));
  if (repo.archived) signals.add("已归档");
  if (repo.fork) signals.add("Fork");
  if (repo.homepage) signals.add("有官网");
  if (readme) signals.add("README");
  if (context?.treeStatus === "loaded") signals.add("代码画像");
  signals.add(CATEGORY_LABELS[category]);

  return Array.from(signals).slice(0, 10);
}

function sourceQuality(readme: string | null, context: RepoCodeContext | null | undefined): RepoAnalysis["sourceQuality"] {
  const hasCode = context?.treeStatus === "loaded";
  if (hasCode && readme) return "code+readme";
  if (hasCode) return "code";
  if (readme) return "readme";
  return "metadata";
}

function writePurposeZh(
  repo: GitHubRepo,
  readme: string | null,
  category: AnalysisCategory,
  profile: DerivedProfile,
) {
  if (profile.intent) {
    const stack = profile.frameworkStack.length ? `代码/配置线索还显示它使用或涉及 ${profile.frameworkStack.slice(0, 6).join("、")}` : "代码结构用于辅助确认用途";
    const architecture = profile.architecture.length ? `可见结构包括 ${profile.architecture.join("、")}` : "公开结构信息较少";
    return `这是一个${profile.intent.projectKindZh}，归类为「${CATEGORY_LABELS[category]}」。核心用途是：${profile.intent.summaryZh} ${stack}；${architecture}。`.trim();
  }

  const title = getReadmeTitle(readme);
  const paragraph = getFirstParagraph(readme);
  const readmeSummary = getReadmeFeatureSummary(readme);
  const description = repo.description ? cleanMarkdown(repo.description) : null;
  const subject = readmeSummary || description || paragraph || title || `${repo.full_name} 的公开仓库信息`;
  const stack = profile.frameworkStack.length ? `技术线索包括 ${profile.frameworkStack.slice(0, 6).join("、")}` : "暂未从关键配置文件里识别到明确框架";
  const architecture = profile.architecture.length ? `仓库结构上能看到 ${profile.architecture.join("、")}` : "仓库结构较简单或公开信息较少";
  const categoryText = CATEGORY_LABELS[category];
  const nuance = profile.frameworkStack.includes("Docker") && category !== "infra" ? "Docker 更像是运行/分发方式，不代表项目本体是运维系统。" : "";

  return `这个仓库主要用于：${subject}。结合代码画像，${stack}；${architecture}。综合判断它更接近「${profile.projectKindZh}」，归类为「${categoryText}」。${nuance}`.trim();
}

function writePurposeEn(
  repo: GitHubRepo,
  readme: string | null,
  category: AnalysisCategory,
  profile: DerivedProfile,
) {
  if (profile.intent) {
    const stack = profile.frameworkStack.length ? `Code/config signals also mention ${profile.frameworkStack.slice(0, 6).join(", ")}` : "The visible code structure is used as supporting evidence";
    const architecture = profile.architecture.length ? `Visible layout signals include ${architectureToEnglish(profile.architecture).join(", ")}` : "The public layout is sparse";
    return `This is a ${profile.intent.projectKindEn} in the "${CATEGORY_EN_LABELS[category]}" category. Main purpose: ${profile.intent.summaryEn} ${stack}; ${architecture}.`.trim();
  }

  const title = getReadmeTitle(readme);
  const paragraph = getFirstParagraph(readme);
  const readmeSummary = getReadmeFeatureSummaryEn(readme);
  const description = repo.description ? cleanMarkdown(repo.description) : null;
  const rawSubject = readmeSummary || description || paragraph || title || `the public repository metadata for ${repo.full_name}`;
  const subject = hasCjk(rawSubject) ? "the repository's stated functionality" : rawSubject;
  const stack = profile.frameworkStack.length ? `Detected stack signals include ${profile.frameworkStack.slice(0, 6).join(", ")}` : "No strong framework signal was found in the sampled files";
  const architecture = profile.architecture.length ? `The repository layout suggests ${architectureToEnglish(profile.architecture).join(", ")}` : "The visible repository layout is fairly small or sparse";
  const dockerNote = profile.frameworkStack.includes("Docker") && category !== "infra" ? "Docker appears to be a runtime or distribution path, not the main product category." : "";

  return `Main purpose: ${subject}. Combining that with the code profile, ${stack}; ${architecture}. I classify it as a ${profile.projectKindEn} in the "${CATEGORY_EN_LABELS[category]}" category. ${dockerNote}`.trim();
}

export function analyzeRepository(
  repo: GitHubRepo,
  readme: string | null,
  readmeStatus: RepoAnalysis["readmeStatus"],
  codeContext?: RepoCodeContext | null,
  error?: string,
): RepoAnalysis {
  const category = classify(repo, readme, codeContext);
  const profile = deriveProfile(repo, readme, codeContext, category);
  const extracted = extractUsage(readme);
  const inferredUsage = inferUsage(repo, codeContext, profile);
  const hasReadmeUsage = extracted.usage.length > 0;
  const hasCodeUsage = codeContext?.treeStatus === "loaded" && inferredUsage.usage.length > 2;
  const usage = hasReadmeUsage ? extracted.usage : inferredUsage.usage;
  const usageEn = hasReadmeUsage ? extracted.usageEn : inferredUsage.usageEn;
  const usageSource = hasReadmeUsage ? "readme" : hasCodeUsage ? "code" : readme ? "metadata" : "inferred";
  const signals = getSignals(repo, category, readme, codeContext, profile);
  const quality = sourceQuality(readme, codeContext);
  const confidence = Math.min(
    98,
    36 +
      (repo.description ? 14 : 0) +
      (readme ? 16 : 0) +
      (codeContext?.treeStatus === "loaded" ? 22 : 0) +
      (profile.frameworkStack.length ? 8 : 0) +
      (profile.intent ? profile.intent.confidenceBoost : 0) +
      (extracted.commands.length ? 8 : 0) +
      (repo.topics?.length ? 5 : 0) -
      (codeContext?.treeStatus === "error" ? 8 : 0),
  );
  const purposeZh = writePurposeZh(repo, readme, category, profile);
  const purposeEn = writePurposeEn(repo, readme, category, profile);

  return {
    repo,
    category,
    purpose: purposeZh,
    purposeZh,
    purposeEn,
    projectKindZh: profile.projectKindZh,
    projectKindEn: profile.projectKindEn,
    frameworkStack: profile.frameworkStack,
    architecture: profile.architecture,
    keyFiles: profile.keyFiles,
    evidence: profile.evidence,
    usage,
    usageEn,
    usageSource,
    signals,
    commands: extracted.commands,
    readmeStatus,
    codeStatus: codeContext?.treeStatus || "skipped",
    sourceQuality: quality,
    analysisEngine: "rules",
    confidence,
    error: error || codeContext?.error,
  };
}
