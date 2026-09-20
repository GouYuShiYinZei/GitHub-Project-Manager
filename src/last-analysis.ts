import type { GitHubUser, RepoAnalysis } from "./types";
import type { SyncSummary } from "./sync";

export type LastAnalysisSnapshot = {
  savedAt: string;
  targetMode: "public" | "authenticated";
  user: GitHubUser;
  analyses: RepoAnalysis[];
  syncSummary: SyncSummary | null;
};

const LAST_ANALYSIS_STORAGE_KEY = "github-star-manager-last-analysis-v1";

function parseSnapshot(value: string | null): LastAnalysisSnapshot | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as LastAnalysisSnapshot;
    if (!parsed?.user?.login || !Array.isArray(parsed.analyses)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function loadLastAnalysis() {
  try {
    return parseSnapshot(localStorage.getItem(LAST_ANALYSIS_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveLastAnalysis(snapshot: LastAnalysisSnapshot) {
  try {
    localStorage.setItem(LAST_ANALYSIS_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // A full browser quota should not make the analysis itself fail.
  }
}

export function clearLastAnalysis() {
  try {
    localStorage.removeItem(LAST_ANALYSIS_STORAGE_KEY);
  } catch {
    // Ignore storage failures; the in-memory results can still be cleared.
  }
}
