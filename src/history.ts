import type { AiRepositoryAnalysis } from "./ai";
import type { GitHubRepo, RepoAnalysis } from "./types";
import { normalizeAiAnalysis } from "./ai-validation";

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
    return Array.isArray(parsed) ? parsed.map(parseRecord).filter((item): item is AiHistoryRecord => item !== null) : [];
  } catch {
    return [];
  }
}

function parseRecord(value: unknown): AiHistoryRecord | null {
  if (!value || typeof value !== "object") return null;
  const item = value as AiHistoryRecord;
  if (typeof item.key !== "string" || typeof item.repoFullName !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(item.repoFullName) || !Number.isFinite(Date.parse(item.analyzedAt))) return null;
  try {
    const analysis = normalizeAiAnalysis(item.analysis);
    if (!analysis.purposeZh) return null;
    const [owner, repoName] = item.repoFullName.split("/");
    return {
      key: item.key, repoFullName: item.repoFullName, owner, repoName,
      repoUrl: `https://github.com/${item.repoFullName}`,
      avatarUrl: `https://github.com/${owner}.png`,
      stars: typeof item.stars === "number" && Number.isFinite(item.stars) ? item.stars : 0,
      category: analysis.category || "general", projectKindZh: analysis.projectKindZh || "AI 分析结果",
      purposeZh: analysis.purposeZh, updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : null,
      analyzedAt: item.analyzedAt, analysis,
    };
  } catch { return null; }
}

export function exportAiHistory(records = loadAiHistory()) {
  return JSON.stringify({ format: "github-star-manager-history", version: 1, exportedAt: new Date().toISOString(), records: records.map(parseRecord).filter(Boolean) }, null, 2);
}

export function importAiHistory(text: string) {
  const backup = JSON.parse(text);
  if (backup?.format !== "github-star-manager-history" || backup.version !== 1 || !Array.isArray(backup.records)) throw new Error("请选择本应用导出的历史备份文件");
  const records = backup.records.map(parseRecord) as Array<AiHistoryRecord | null>;
  if (records.some((record) => !record)) throw new Error("备份中存在无效记录，未导入任何内容");
  const merged = new Map<string, AiHistoryRecord>();
  for (const record of [...loadAiHistory(), ...records as AiHistoryRecord[]]) {
    const previous = merged.get(record.key);
    if (!previous || Date.parse(record.analyzedAt) > Date.parse(previous.analyzedAt)) merged.set(record.key, record);
  }
  const next = [...merged.values()].sort((a, b) => Date.parse(b.analyzedAt) - Date.parse(a.analyzedAt));
  if (next.length > MAX_HISTORY) throw new Error(`合并后超过 ${MAX_HISTORY} 条，请先备份并整理现有历史`);
  try { localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next)); }
  catch { throw new Error("本机存储空间不足，导入未保存。请先导出备份并整理历史"); }
  return next;
}

export function getRepoHistoryKey(repo: GitHubRepo) {
  return [
    "v3",
    repo.full_name,
    repo.pushed_at,
    repo.pushed_at ? null : repo.updated_at,
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
  return loadAiHistory().find((record) => {
    if (record.key === key || record.key === legacyKey) return true;
    // v2 included GitHub's mutable updated_at. Preserve valid existing analyses.
    try {
      const old = record.key.split("@").map((part) => JSON.parse(part));
      const current = key.split("@").map((part) => JSON.parse(part));
      return old[0] === "v2" && old.length === current.length && old.every((value, index) =>
        index === 0 || (index === 3 && repo.pushed_at) || JSON.stringify(value) === JSON.stringify(current[index]));
    } catch { return false; }
  }) || null;
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
