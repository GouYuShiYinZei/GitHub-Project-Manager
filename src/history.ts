import type { AiRepositoryAnalysis } from "./ai";
import type { GitHubRepo, RepoAnalysis } from "./types";

export type AiHistoryRecord = {
  key: string;
  repoFullName: string;
  repoName: string;
  owner: string;
  repoUrl: string;
  avatarUrl: string;
  stars: number;
  category: string;
  projectKindZh: string;
  purposeZh: string;
  updatedAt: string | null;
  analyzedAt: string;
  analysis: AiRepositoryAnalysis;
};

const HISTORY_STORAGE_KEY = "github-star-manager-ai-history-v1";
const MAX_HISTORY = 500;

function safeParse(value: string | null): AiHistoryRecord[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getRepoHistoryKey(repo: GitHubRepo) {
  return [
    "v2",
    repo.full_name,
    repo.pushed_at,
    repo.updated_at,
    repo.description,
    repo.default_branch,
    [...(repo.topics || [])].sort(),
  ].map((value) => JSON.stringify(value)).join("@");
}

function getLegacyRepoHistoryKey(repo: GitHubRepo) {
  return [repo.full_name, repo.pushed_at || repo.updated_at || repo.default_branch || "unknown"].join("@");
}

export function loadAiHistory() {
  try {
    return safeParse(localStorage.getItem(HISTORY_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function findAiHistory(repo: GitHubRepo) {
  const key = getRepoHistoryKey(repo);
  const legacyKey = getLegacyRepoHistoryKey(repo);
  return loadAiHistory().find((record) => record.key === key || record.key === legacyKey) || null;
}

export function saveAiHistory(repo: GitHubRepo, analysis: AiRepositoryAnalysis) {
  const key = getRepoHistoryKey(repo);
  const legacyKey = getLegacyRepoHistoryKey(repo);
  const record: AiHistoryRecord = {
    key,
    repoFullName: repo.full_name,
    repoName: repo.name,
    owner: repo.owner.login,
    repoUrl: repo.html_url,
    avatarUrl: repo.owner.avatar_url,
    stars: repo.stargazers_count,
    category: analysis.category || "general",
    projectKindZh: analysis.projectKindZh || "AI 分析结果",
    purposeZh: analysis.purposeZh || "",
    updatedAt: repo.pushed_at || repo.updated_at,
    analyzedAt: new Date().toISOString(),
    analysis,
  };

  const next = [record, ...loadAiHistory().filter((item) => item.key !== key && item.key !== legacyKey)].slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function saveAppliedAiHistory(repo: GitHubRepo, analysis: AiRepositoryAnalysis, applied: RepoAnalysis) {
  return saveAiHistory(repo, {
    ...analysis,
    category: applied.category,
    projectKindZh: applied.projectKindZh,
    projectKindEn: applied.projectKindEn,
    purposeZh: applied.purposeZh,
    purposeEn: applied.purposeEn,
    usage: applied.usage,
    usageEn: applied.usageEn,
    frameworkStack: applied.frameworkStack,
    architecture: applied.architecture,
    evidence: applied.evidence,
    confidence: applied.confidence,
  });
}

export function deleteAiHistoryRecord(key: string) {
  const next = loadAiHistory().filter((record) => record.key !== key);
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearAiHistory() {
  localStorage.removeItem(HISTORY_STORAGE_KEY);
  return [];
}
