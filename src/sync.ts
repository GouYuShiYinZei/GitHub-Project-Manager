import type { GitHubRepo } from "./types";

export type SyncSummary = {
  targetKey: string;
  targetLogin: string;
  currentCount: number;
  previousCount: number;
  firstSync: boolean;
  added: string[];
  removed: string[];
  changed: string[];
  syncedAt: string;
  aiReused: number;
  aiAnalyzed: number;
};

type SnapshotEntry = {
  id: number;
  fullName: string;
  pushedAt: string | null;
  updatedAt: string | null;
  description: string | null;
  defaultBranch: string;
  topics: string[];
};

type SnapshotStore = Record<string, SnapshotEntry[]>;

const SNAPSHOT_STORAGE_KEY = "github-star-manager-star-snapshots-v1";

function loadSnapshots(): SnapshotStore {
  try {
    const value = localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!value) return {};
    const parsed = JSON.parse(value) as SnapshotStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function snapshotOf(repo: GitHubRepo): SnapshotEntry {
  return {
    id: repo.id,
    fullName: repo.full_name,
    pushedAt: repo.pushed_at,
    updatedAt: repo.updated_at,
    description: repo.description,
    defaultBranch: repo.default_branch,
    topics: [...(repo.topics || [])].sort(),
  };
}

function snapshotFingerprint(entry: SnapshotEntry) {
  return JSON.stringify([
    entry.pushedAt,
    entry.updatedAt,
    entry.description,
    entry.defaultBranch,
    entry.topics,
  ]);
}

export function compareAndStoreStarredRepos(mode: "public" | "authenticated", login: string, repos: GitHubRepo[]): SyncSummary {
  const targetLogin = login.trim().toLowerCase();
  const targetKey = `${mode}:${targetLogin}`;
  const snapshots = loadSnapshots();
  const previous = snapshots[targetKey];
  const current = repos.map(snapshotOf);
  const previousByName = new Map((previous || []).map((entry) => [entry.fullName, entry]));
  const currentByName = new Map(current.map((entry) => [entry.fullName, entry]));

  const added = previous
    ? current.filter((entry) => !previousByName.has(entry.fullName)).map((entry) => entry.fullName)
    : [];
  const removed = previous
    ? previous.filter((entry) => !currentByName.has(entry.fullName)).map((entry) => entry.fullName)
    : [];
  const changed = previous
    ? current
        .filter((entry) => {
          const before = previousByName.get(entry.fullName);
          return before && snapshotFingerprint(before) !== snapshotFingerprint(entry);
        })
        .map((entry) => entry.fullName)
    : [];

  snapshots[targetKey] = current;
  try {
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshots));
  } catch {
    // Sync should never stop analysis when browser storage is unavailable.
  }

  return {
    targetKey,
    targetLogin,
    currentCount: current.length,
    previousCount: previous?.length || 0,
    firstSync: !previous,
    added,
    removed,
    changed,
    syncedAt: new Date().toISOString(),
    aiReused: 0,
    aiAnalyzed: 0,
  };
}
