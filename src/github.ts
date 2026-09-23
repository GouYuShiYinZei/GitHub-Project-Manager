import type { GitHubRepo, GitHubUser, RateLimitInfo, RepoCodeContext, RepoKeyFile, RepoTreeItem } from "./types";
import { appFetch } from "./transport";

const API_BASE = "https://api.github.com";
const API_VERSION = "2022-11-28";

export class GitHubApiError extends Error {
  status: number;
  rateLimit: RateLimitInfo;

  constructor(message: string, status: number, rateLimit: RateLimitInfo) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.rateLimit = rateLimit;
  }
}

function getRateLimit(response: Response): RateLimitInfo {
  const toNumber = (value: string | null) => {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return {
    limit: toNumber(response.headers.get("x-ratelimit-limit")),
    remaining: toNumber(response.headers.get("x-ratelimit-remaining")),
    reset: toNumber(response.headers.get("x-ratelimit-reset")),
  };
}

function buildHeaders(token: string | undefined, accept = "application/vnd.github+json") {
  const headers: Record<string, string> = {
    Accept: accept,
    "X-GitHub-Api-Version": API_VERSION,
  };

  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  return headers;
}

async function parseError(response: Response) {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message || response.statusText;
  } catch {
    return response.statusText;
  }
}

async function requestJson<T>(path: string, token: string | undefined, signal?: AbortSignal) {
  const response = await appFetch(`${API_BASE}${path}`, {
    headers: buildHeaders(token),
    signal,
  });
  const rateLimit = getRateLimit(response);

  if (!response.ok) {
    const message = await parseError(response);
    throw new GitHubApiError(message, response.status, rateLimit);
  }

  return {
    data: (await response.json()) as T,
    rateLimit,
    response,
  };
}

export async function fetchUser(username: string, token?: string, signal?: AbortSignal) {
  return requestJson<GitHubUser>(`/users/${encodeURIComponent(username)}`, token, signal);
}

export async function fetchAuthenticatedUser(token: string, signal?: AbortSignal) {
  return requestJson<GitHubUser>("/user", token, signal);
}

export async function fetchRepositoryMetadata(fullName: string, token?: string, signal?: AbortSignal) {
  const [owner, name] = fullName.split("/", 2);
  if (!owner || !name) throw new Error("榜单项目名称无效");
  return requestJson<GitHubRepo>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, token, signal);
}

function getLastPage(linkHeader: string | null) {
  if (!linkHeader) return null;
  const lastMatch = linkHeader.match(/[?&]page=(\d+)>;\s*rel="last"/);
  if (!lastMatch) return null;
  const parsed = Number(lastMatch[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function fetchStarredRepos(
  username: string,
  token: string | undefined,
  signal: AbortSignal | undefined,
  onPage: (currentPage: number, totalPages: number | null, rateLimit: RateLimitInfo) => void,
) {
  const repos: GitHubRepo[] = [];
  let page = 1;
  let totalPages: number | null = null;

  while (true) {
    const result = await requestJson<GitHubRepo[]>(
      `/users/${encodeURIComponent(username)}/starred?per_page=100&page=${page}&sort=created&direction=desc`,
      token,
      signal,
    );

    if (page === 1) {
      totalPages = getLastPage(result.response.headers.get("link"));
    }

    repos.push(...result.data);
    onPage(page, totalPages, result.rateLimit);

    if (result.data.length < 100 || (totalPages !== null && page >= totalPages)) {
      break;
    }

    page += 1;
  }

  return repos;
}

export async function fetchAuthenticatedStarredRepos(
  token: string,
  signal: AbortSignal | undefined,
  onPage: (currentPage: number, totalPages: number | null, rateLimit: RateLimitInfo) => void,
) {
  const repos: GitHubRepo[] = [];
  let page = 1;
  let totalPages: number | null = null;

  while (true) {
    const result = await requestJson<GitHubRepo[]>(
      `/user/starred?per_page=100&page=${page}&sort=created&direction=desc`,
      token,
      signal,
    );

    if (page === 1) {
      totalPages = getLastPage(result.response.headers.get("link"));
    }

    repos.push(...result.data);
    onPage(page, totalPages, result.rateLimit);

    if (result.data.length < 100 || (totalPages !== null && page >= totalPages)) {
      break;
    }

    page += 1;
  }

  return repos;
}

export async function fetchReadme(
  repo: GitHubRepo,
  token?: string,
  signal?: AbortSignal,
) {
  const response = await appFetch(
    `${API_BASE}/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}/readme`,
    {
      headers: buildHeaders(token, "application/vnd.github.raw+json"),
      signal,
    },
  );
  const rateLimit = getRateLimit(response);

  if (response.status === 404) {
    return { readme: null, rateLimit, status: "missing" as const };
  }

  if (!response.ok) {
    const message = await parseError(response);
    throw new GitHubApiError(message, response.status, rateLimit);
  }

  return {
    readme: await response.text(),
    rateLimit,
    status: "loaded" as const,
  };
}

type GitHubTreeResponse = {
  tree: Array<{
    path?: string;
    type?: "blob" | "tree" | "commit";
    size?: number;
  }>;
  truncated: boolean;
};

const KEY_FILE_NAMES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "bun.lockb",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
  "poetry.lock",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
  "Makefile",
  "vite.config.ts",
  "vite.config.js",
  "next.config.js",
  "next.config.mjs",
  "tsconfig.json",
  "tailwind.config.js",
  "tailwind.config.ts",
  "AndroidManifest.xml",
  "SKILL.md",
]);

const ENTRYPOINT_PATTERNS = [
  /^src\/main\.(ts|tsx|js|jsx|py|go|rs)$/i,
  /^src\/index\.(ts|tsx|js|jsx)$/i,
  /^src\/app\.(ts|tsx|js|jsx)$/i,
  /^app\/main\.py$/i,
  /^main\.(py|go|rs)$/i,
  /^cmd\/[^/]+\/main\.go$/i,
  /^server\.(ts|js|py)$/i,
  /^api\/index\.(ts|js)$/i,
  /(?:^|\/)MainActivity\.kt$/i,
  /(?:^|\/)Application\.kt$/i,
  /^[^/]+\.(sh|ps1)$/i,
];

function repoPath(repo: GitHubRepo) {
  return `/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}`;
}

function isKeyFile(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const fileName = normalized.split("/").pop() || normalized;
  if (KEY_FILE_NAMES.has(fileName)) return true;
  if (/^\.github\/workflows\/[^/]+\.ya?ml$/i.test(normalized)) return true;
  if (/^docs?\//i.test(normalized) && /getting-started|installation|usage/i.test(normalized)) return true;
  return ENTRYPOINT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function selectKeyFiles(items: RepoTreeItem[], repoName?: string) {
  const candidates = items
    .filter((item) => item.type === "blob" && (isKeyFile(item.path) || item.path === repoName) && (item.size ?? 0) <= 180_000)
    .sort((a, b) => {
      const aDepth = a.path.split("/").length;
      const bDepth = b.path.split("/").length;
      return aDepth - bDepth || a.path.localeCompare(b.path);
    });

  const highPriority = candidates.filter((item) => {
    const name = item.path.split("/").pop() || item.path;
    return KEY_FILE_NAMES.has(name) && !/lock/i.test(name) && name !== "SKILL.md";
  });
  const entrypoints = candidates.filter((item) => item.path === repoName || ENTRYPOINT_PATTERNS.some((pattern) => pattern.test(item.path)));
  const workflows = candidates.filter((item) => item.path.startsWith(".github/workflows/"));

  const skills = candidates.filter((item) => /(^|\/)SKILL\.md$/.test(item.path) && !/^\.(codex|claude|agents)\//.test(item.path));
  const guides = candidates.filter((item) => /^docs?\//i.test(item.path));
  // Reserve space for behavior and instructions instead of filling every slot with manifests.
  return Array.from(new Map([
    ...highPriority.slice(0, 4), ...entrypoints.slice(0, 3), ...skills.slice(0, 2), ...guides.slice(0, 1),
    ...highPriority.slice(4), ...workflows,
  ].map((item) => [item.path, item])).values()).slice(0, 10);
}

async function fetchRepositoryTree(repo: GitHubRepo, token: string | undefined, signal?: AbortSignal) {
  const branch = encodeURIComponent(repo.default_branch || "HEAD");
  const result = await requestJson<GitHubTreeResponse>(
    `${repoPath(repo)}/git/trees/${branch}?recursive=1`,
    token,
    signal,
  );

  const items: RepoTreeItem[] = result.data.tree
    .filter((item): item is { path: string; type: "blob" | "tree"; size?: number } => Boolean(item.path) && (item.type === "blob" || item.type === "tree"))
    .map((item) => ({
      path: item.path,
      type: item.type,
      size: item.size,
    }));

  return {
    items,
    truncated: result.data.truncated,
    rateLimit: result.rateLimit,
  };
}

async function fetchRepositoryLanguages(repo: GitHubRepo, token: string | undefined, signal?: AbortSignal) {
  const result = await requestJson<Record<string, number>>(`${repoPath(repo)}/languages`, token, signal);
  return {
    languageBytes: result.data,
    rateLimit: result.rateLimit,
  };
}

async function fetchRawFile(repo: GitHubRepo, path: string, token: string | undefined, signal?: AbortSignal): Promise<RepoKeyFile | null> {
  const response = await appFetch(
    `${API_BASE}${repoPath(repo)}/contents/${path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")}?ref=${encodeURIComponent(repo.default_branch || "HEAD")}`,
    {
      headers: buildHeaders(token, "application/vnd.github.raw+json"),
      signal,
    },
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    const message = await parseError(response);
    throw new GitHubApiError(message, response.status, getRateLimit(response));
  }

  const text = await response.text();
  return {
    path,
    content: text.length > 70_000 ? text.slice(0, 70_000) : text,
    truncated: text.length > 70_000,
  };
}

export async function fetchCodeContext(
  repo: GitHubRepo,
  token?: string,
  signal?: AbortSignal,
): Promise<{ context: RepoCodeContext; rateLimit: RateLimitInfo | null }> {
  try {
    const [treeResult, languageResult] = await Promise.allSettled([
      fetchRepositoryTree(repo, token, signal),
      fetchRepositoryLanguages(repo, token, signal),
    ]);

    let rateLimit: RateLimitInfo | null = null;
    const treeItems = treeResult.status === "fulfilled" ? treeResult.value.items : [];
    const languageBytes = languageResult.status === "fulfilled" ? languageResult.value.languageBytes : {};
    if (treeResult.status === "fulfilled") rateLimit = treeResult.value.rateLimit;
    if (languageResult.status === "fulfilled") rateLimit = languageResult.value.rateLimit;

    if (treeResult.status === "rejected" && languageResult.status === "rejected") {
      const message = treeResult.reason instanceof Error ? treeResult.reason.message : "无法读取仓库结构";
      return {
        context: {
          treeStatus: "error",
          languageBytes: {},
          files: [],
          directories: [],
          keyFiles: [],
          truncated: false,
          error: message,
        },
        rateLimit,
      };
    }

    const selectedFiles = selectKeyFiles(treeItems, repo.name);
    const keyFiles: RepoKeyFile[] = [];

    for (const item of selectedFiles) {
      try {
        const file = await fetchRawFile(repo, item.path, token, signal);
        if (file) keyFiles.push(file);
      } catch {
        // Keep the repository-level analysis moving even if one optional file fails.
      }
    }

    return {
      context: {
        treeStatus: treeResult.status === "fulfilled" ? "loaded" : "error",
        languageBytes,
        files: treeItems.filter((item) => item.type === "blob").map((item) => item.path),
        directories: treeItems.filter((item) => item.type === "tree").map((item) => item.path),
        keyFiles,
        truncated: treeResult.status === "fulfilled" ? treeResult.value.truncated : false,
        error: treeResult.status === "rejected" && treeResult.reason instanceof Error ? treeResult.reason.message : undefined,
      },
      rateLimit,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return {
      context: {
        treeStatus: "error",
        languageBytes: {},
        files: [],
        directories: [],
        keyFiles: [],
        truncated: false,
        error: error instanceof Error ? error.message : "无法读取仓库结构",
      },
      rateLimit: error instanceof GitHubApiError ? error.rateLimit : null,
    };
  }
}
