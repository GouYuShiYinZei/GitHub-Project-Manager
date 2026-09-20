export type GitHubUser = {
  login: string;
  avatar_url: string;
  html_url: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  followers: number;
  following: number;
  public_repos: number;
};

export type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  pushed_at: string | null;
  updated_at: string | null;
  created_at: string | null;
  homepage: string | null;
  topics?: string[];
  archived: boolean;
  fork: boolean;
  default_branch: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  license: {
    key: string;
    name: string;
  } | null;
};

export type RateLimitInfo = {
  limit: number | null;
  remaining: number | null;
  reset: number | null;
};

export type RepoTreeItem = {
  path: string;
  type: "blob" | "tree";
  size?: number;
};

export type RepoKeyFile = {
  path: string;
  content: string;
  truncated: boolean;
};

export type RepoCodeContext = {
  treeStatus: "loaded" | "missing" | "skipped" | "error";
  languageBytes: Record<string, number>;
  files: string[];
  directories: string[];
  keyFiles: RepoKeyFile[];
  truncated: boolean;
  error?: string;
};

export type AnalysisCategory =
  | "ai"
  | "frontend"
  | "backend"
  | "devtools"
  | "data"
  | "infra"
  | "mobile"
  | "docs"
  | "testing"
  | "media"
  | "productivity"
  | "general";

export type RepoAnalysis = {
  repo: GitHubRepo;
  category: AnalysisCategory;
  purpose: string;
  purposeZh: string;
  purposeEn: string;
  projectKindZh: string;
  projectKindEn: string;
  frameworkStack: string[];
  architecture: string[];
  keyFiles: string[];
  evidence: string[];
  usage: string[];
  usageEn: string[];
  usageSource: "readme" | "code" | "inferred" | "metadata";
  signals: string[];
  commands: string[];
  readmeStatus: "loaded" | "missing" | "skipped" | "error";
  codeStatus: RepoCodeContext["treeStatus"];
  sourceQuality: "code+readme" | "code" | "readme" | "metadata";
  analysisEngine: "rules" | "ai";
  confidence: number;
  error?: string;
};

export type ProgressState = {
  phase: "idle" | "user" | "stars" | "code" | "readme" | "done" | "error";
  current: number;
  total: number;
  message: string;
};
