import {
  AlertCircle,
  Archive,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleStop,
  Code2,
  ExternalLink,
  Download,
  Upload,
  Filter,
  GitBranch,
  KeyRound,
  Link as LinkIcon,
  Loader2,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  Users,
  X,
  ArrowDown,
  ArrowUp,
  Minus,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { applyAiAnalysis, requestAiRepositoryAnalysis } from "./ai";
import { clearAiConfig, EMPTY_AI_CONFIG, loadAiConfig, saveAiConfig, type AiConfig } from "./ai-config";
import { analyzeRepository, CATEGORY_COLORS, CATEGORY_LABELS } from "./analyzer";
import { fetchAuthenticatedStarredRepos, fetchAuthenticatedUser, fetchCodeContext, fetchReadme, fetchRepositoryMetadata, fetchStarredRepos, fetchUser, GitHubApiError } from "./github";
import { clearAiHistory, deleteAiHistoryRecord, findAiHistory, loadAiHistory, saveAppliedAiHistory, exportAiHistory, importAiHistory, type AiHistoryRecord } from "./history";
import { clearLastAnalysis, loadLastAnalysis, saveLastAnalysis } from "./last-analysis";
import { fetchStarHistoryRankings, type StarHistoryRankRepo, type StarHistoryRankings } from "./star-history";
import { compareAndStoreStarredRepos, type SyncSummary } from "./sync";
import type { AnalysisCategory, GitHubRepo, GitHubUser, ProgressState, RateLimitInfo, RepoAnalysis, RepoCodeContext } from "./types";

type SortMode = "starred" | "stars" | "updated" | "confidence";
type UsageFilter = "all" | "readme" | "code" | "inferred";
type TargetMode = "public" | "authenticated";
type ResultsView = "analysis" | "history";
type RankingTab = "weekly" | "alltime";
type RankingAiProgress = {
  running: boolean;
  current: number;
  total: number;
  message: string;
  error: string | null;
};

const TOKEN_STORAGE_KEY = "github-star-manager-token";
const REMEMBER_TOKEN_STORAGE_KEY = "github-star-manager-remember-token";
const USERNAME_STORAGE_KEY = "github-star-manager-username";
const REMEMBER_USERNAME_STORAGE_KEY = "github-star-manager-remember-username";

const DEFAULT_RANKING_AI_PROGRESS: RankingAiProgress = {
  running: false,
  current: 0,
  total: 0,
  message: "",
  error: null,
};

const DEFAULT_PROGRESS: ProgressState = {
  phase: "idle",
  current: 0,
  total: 0,
  message: "输入 GitHub 用户名后开始分析",
};

const CATEGORY_ORDER: AnalysisCategory[] = [
  "ai",
  "frontend",
  "backend",
  "devtools",
  "productivity",
  "data",
  "infra",
  "mobile",
  "testing",
  "media",
  "docs",
  "general",
];

const SAMPLE_USERS = ["Never-error", "torvalds", "sindresorhus"];

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatDate(value: string | null) {
  if (!value) return "未知";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function getRateLimitText(rateLimit: RateLimitInfo | null) {
  if (!rateLimit?.limit) return "速率未知";
  const reset = rateLimit.reset ? new Date(rateLimit.reset * 1000) : null;
  const resetText = reset
    ? new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(reset)
    : "稍后";
  return `${rateLimit.remaining ?? "-"} / ${rateLimit.limit}，${resetText} 重置`;
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function getErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "已停止本次分析";
  }

  if (error instanceof GitHubApiError) {
    if (error.status === 404) return "没有找到这个 GitHub 用户，请检查用户名拼写。";
    if (error.status === 403) return "GitHub API 速率限制或访问被拒绝，建议填入 Personal Access Token 后重试。";
    return `GitHub API 返回 ${error.status}：${error.message}`;
  }

  if (error instanceof Error) {
    const rawMessage = error.message;
    if (/insufficient balance/i.test(rawMessage)) return "AI 服务余额不足";
    if (/service temporarily unavailable|temporarily unavailable|503 service unavailable/i.test(rawMessage)) return "AI 服务暂时不可用，已自动切换为规则分析，请稍后重试。";
    if (/invalid api key|unauthorized client|unauthenticated|invalid.*key/i.test(rawMessage)) return "AI API Key 无效或未被此服务授权";
    try {
      const parsed = JSON.parse(rawMessage) as { error?: { message?: string } | string };
      const nested = typeof parsed.error === "string" ? parsed.error : parsed.error?.message;
      if (nested) {
        if (/insufficient balance/i.test(nested)) return "AI 服务余额不足";
        if (/service temporarily unavailable|temporarily unavailable|503 service unavailable/i.test(nested)) return "AI 服务暂时不可用，已自动切换为规则分析，请稍后重试。";
        if (/invalid api key|unauthorized|unauthenticated|invalid.*key/i.test(nested)) return "AI API Key 无效或未被此服务授权";
        return nested;
      }
    } catch {
      // Keep the original message when the upstream response is not JSON.
    }
    return rawMessage;
  }
  return "分析失败，请稍后重试。";
}

function categoryLabel(category: AnalysisCategory | "all") {
  return category === "all" ? "全部方向" : CATEGORY_LABELS[category];
}

function getHistoryCategory(category: string): AnalysisCategory {
  return CATEGORY_ORDER.includes(category as AnalysisCategory) ? (category as AnalysisCategory) : "general";
}

function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function getStoredUsername() {
  try {
    return localStorage.getItem(USERNAME_STORAGE_KEY) || "Never-error";
  } catch {
    return "Never-error";
  }
}

function getStoredRememberToken() {
  try {
    return localStorage.getItem(REMEMBER_TOKEN_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function getStoredRememberUsername() {
  try {
    return localStorage.getItem(REMEMBER_USERNAME_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function App() {
  const [lastAnalysisSnapshot] = useState(() => loadLastAnalysis());
  const [initialAiConfig] = useState(() => loadAiConfig());
  const [username, setUsername] = useState(() => getStoredUsername().trim() || lastAnalysisSnapshot?.user.login || "Never-error");
  const [rememberUsername, setRememberUsername] = useState(() => getStoredRememberUsername());
  const [usernameSaved, setUsernameSaved] = useState(() => Boolean(getStoredRememberUsername() && getStoredUsername()));
  const [savedUsername, setSavedUsername] = useState(() => (getStoredRememberUsername() ? getStoredUsername() : ""));
  const [targetMode, setTargetMode] = useState<TargetMode>("public");
  const [token, setToken] = useState(() => getStoredToken());
  const [rememberToken, setRememberToken] = useState(() => getStoredRememberToken());
  const [tokenSaved, setTokenSaved] = useState(() => Boolean(getStoredToken()));
  const [user, setUser] = useState<GitHubUser | null>(() => lastAnalysisSnapshot?.user || null);
  const [analyses, setAnalyses] = useState<RepoAnalysis[]>(() => lastAnalysisSnapshot?.analyses || []);
  const [progress, setProgress] = useState<ProgressState>(() =>
    lastAnalysisSnapshot
      ? {
          phase: "done",
          current: lastAnalysisSnapshot.analyses.length,
          total: lastAnalysisSnapshot.analyses.length,
          message: `已恢复上次对 @${lastAnalysisSnapshot.user.login} 的分析结果`,
        }
      : DEFAULT_PROGRESS,
  );
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AnalysisCategory | "all">("all");
  const [sortMode, setSortMode] = useState<SortMode>("starred");
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all");
  const [includeArchived, setIncludeArchived] = useState(true);
  const [useAiAnalysis, setUseAiAnalysis] = useState(true);
  const [aiConfig, setAiConfig] = useState<AiConfig>(initialAiConfig);
  const [rememberAiConfig, setRememberAiConfig] = useState(() => Boolean(initialAiConfig.apiKey || initialAiConfig.baseUrl));
  const [aiConfigSaved, setAiConfigSaved] = useState(() => Boolean(initialAiConfig.apiKey || initialAiConfig.baseUrl));
  const [maxRepos, setMaxRepos] = useState(0);
  const [aiHistory, setAiHistory] = useState<AiHistoryRecord[]>(() => loadAiHistory());
  const [showHistory, setShowHistory] = useState(false);
  const [resultsView, setResultsView] = useState<ResultsView>("analysis");
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(() => lastAnalysisSnapshot?.syncSummary || null);
  const [showRankings, setShowRankings] = useState(false);
  const [rankingTab, setRankingTab] = useState<RankingTab>("weekly");
  const [rankings, setRankings] = useState<StarHistoryRankings | null>(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState<string | null>(null);
  const [rankingRepos, setRankingRepos] = useState<Record<string, GitHubRepo>>({});
  const [rankingReposLoading, setRankingReposLoading] = useState(false);
  const [rankingAiAnalyses, setRankingAiAnalyses] = useState<Record<string, RepoAnalysis>>({});
  const [rankingAiProgress, setRankingAiProgress] = useState<RankingAiProgress>(DEFAULT_RANKING_AI_PROGRESS);
  const abortRef = useRef<AbortController | null>(null);
  const rankingAiAbortRef = useRef<AbortController | null>(null);

  const isLoading = ["user", "stars", "readme", "code"].includes(progress.phase);
  const safeUsername = username.trim();
  const activeToken = token.trim();

  const stats = useMemo(() => {
    const totalRepos = analyses.length;
    const totalStars = analyses.reduce((sum, item) => sum + item.repo.stargazers_count, 0);
    const loadedReadmes = analyses.filter((item) => item.readmeStatus === "loaded").length;
    const loadedCode = analyses.filter((item) => item.codeStatus === "loaded").length;
    const inferred = analyses.filter((item) => item.usageSource !== "readme").length;
    const languages = new Map<string, number>();
    const categories = new Map<AnalysisCategory, number>();
    const topics = new Map<string, number>();

    for (const item of analyses) {
      if (item.repo.language) languages.set(item.repo.language, (languages.get(item.repo.language) || 0) + 1);
      categories.set(item.category, (categories.get(item.category) || 0) + 1);
      for (const topic of item.repo.topics || []) {
        topics.set(topic, (topics.get(topic) || 0) + 1);
      }
    }

    return {
      totalRepos,
      totalStars,
      loadedReadmes,
      loadedCode,
      inferred,
      languages: Array.from(languages.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8),
      categories: CATEGORY_ORDER.map((item) => [item, categories.get(item) || 0] as const).filter(([, count]) => count > 0),
      topics: Array.from(topics.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 14),
    };
  }, [analyses]);

  const filteredAnalyses = useMemo(() => {
    const search = normalizeSearch(query);

    return analyses
      .filter((item) => {
        if (!includeArchived && item.repo.archived) return false;
        if (category !== "all" && item.category !== category) return false;
        if (usageFilter === "readme" && item.usageSource !== "readme") return false;
        if (usageFilter === "code" && item.usageSource !== "code") return false;
        if (usageFilter === "inferred" && (item.usageSource === "readme" || item.usageSource === "code")) return false;

        if (!search) return true;

        const haystack = [
          item.repo.full_name,
          item.repo.description,
          item.repo.language,
          item.purpose,
          item.purposeEn,
          item.projectKindZh,
          item.projectKindEn,
          item.frameworkStack.join(" "),
          item.architecture.join(" "),
          item.keyFiles.join(" "),
          item.evidence.join(" "),
          item.usage.join(" "),
          item.usageEn.join(" "),
          item.signals.join(" "),
          ...(item.repo.topics || []),
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(search);
      })
      .sort((a, b) => {
        if (sortMode === "stars") return b.repo.stargazers_count - a.repo.stargazers_count;
        if (sortMode === "updated") return new Date(b.repo.pushed_at || 0).getTime() - new Date(a.repo.pushed_at || 0).getTime();
        if (sortMode === "confidence") return b.confidence - a.confidence;
        return 0;
      });
  }, [analyses, category, includeArchived, query, sortMode, usageFilter]);

  const progressPercent = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;
  const topLanguageCount = stats.languages[0]?.[1] || 1;
  const topCategoryCount = stats.categories[0]?.[1] || 1;
  const deepAnalysisTotal = maxRepos > 0 ? maxRepos : "全部";
  const canAnalyze = targetMode === "authenticated" ? Boolean(activeToken) : Boolean(safeUsername);

  async function loadRankingRepoMetadata(repos: StarHistoryRankRepo[], signal?: AbortSignal) {
    const known = new Set([
      ...Object.keys(rankingRepos),
      ...analyses.map((item) => item.repo.full_name.toLowerCase()),
    ]);
    const missing = repos.filter((item) => !known.has(item.name.toLowerCase()));
    if (!missing.length) return;

    setRankingReposLoading(true);
    try {
      for (let index = 0; index < missing.length; index += 5) {
        const chunk = missing.slice(index, index + 5);
        const results = await Promise.allSettled(
          chunk.map((item) => fetchRepositoryMetadata(item.name, activeToken || undefined, signal)),
        );
        setRankingRepos((current) => {
          const next = { ...current };
          results.forEach((result) => {
            if (result.status === "fulfilled") next[result.value.data.full_name.toLowerCase()] = result.value.data;
          });
          return next;
        });
      }
    } finally {
      setRankingReposLoading(false);
    }
  }

  async function loadRankings(forceRefresh = false) {
    if (rankingLoading) return;
    setRankingLoading(true);
    setRankingError(null);
    try {
      const data = await fetchStarHistoryRankings(forceRefresh);
      setRankings(data);
      await loadRankingRepoMetadata(data[rankingTab].repos);
    } catch (nextError) {
      setRankingError(nextError instanceof Error ? nextError.message : "无法读取 Star History 榜单");
    } finally {
      setRankingLoading(false);
    }
  }

  function handleOpenRankings() {
    setShowRankings(true);
    if (!rankings) void loadRankings();
    else void loadRankingRepoMetadata(rankings[rankingTab].repos);
  }

  function handleRankingTabChange(nextTab: RankingTab) {
    setRankingTab(nextTab);
    if (rankings) void loadRankingRepoMetadata(rankings[nextTab].repos);
  }

  async function handleRankingAiAnalyze() {
    const activeRanking = rankings?.[rankingTab];
    if (!activeRanking || rankingAiProgress.running) return;

    rankingAiAbortRef.current?.abort();
    const controller = new AbortController();
    rankingAiAbortRef.current = controller;
    setRankingAiProgress({
      running: true,
      current: 0,
      total: activeRanking.repos.length,
      message: "准备分析当前榜单",
      error: null,
    });

    for (let index = 0; index < activeRanking.repos.length; index += 1) {
      const rankedRepo = activeRanking.repos[index];
      const key = rankedRepo.name.toLowerCase();
      try {
        setRankingAiProgress({
          running: true,
          current: index + 1,
          total: activeRanking.repos.length,
          message: `正在分析 ${rankedRepo.name}`,
          error: null,
        });

        let repo = rankingRepos[key] || analyses.find((item) => item.repo.full_name.toLowerCase() === key)?.repo;
        if (!repo) {
          const metadata = await fetchRepositoryMetadata(rankedRepo.name, activeToken || undefined, controller.signal);
          repo = metadata.data;
          setRankingRepos((current) => ({ ...current, [key]: metadata.data }));
        }

        const existing = analyses.find((item) => item.repo.full_name.toLowerCase() === key);
        const initialBase = existing || analyzeRepository(repo, null, "missing", null);
        const cached = findAiHistory(repo);
        if (cached) {
          setRankingAiAnalyses((current) => ({ ...current, [key]: applyAiAnalysis(initialBase, cached.analysis) }));
          continue;
        }

        let readme: string | null = null;
        let readmeStatus: RepoAnalysis["readmeStatus"] = "missing";
        try {
          const readmeResult = await fetchReadme(repo, activeToken || undefined, controller.signal);
          readme = readmeResult.readme;
          readmeStatus = readmeResult.status;
        } catch (readmeError) {
          if (readmeError instanceof DOMException && readmeError.name === "AbortError") throw readmeError;
          readmeStatus = "error";
        }

        const baseAnalysis = analyzeRepository(repo, readme, readmeStatus, null);
        const ai = await requestAiRepositoryAnalysis(repo, readme, null, baseAnalysis, controller.signal, aiConfig);
        const applied = applyAiAnalysis(baseAnalysis, ai);
        setRankingAiAnalyses((current) => ({ ...current, [key]: applied }));
        setAiHistory(saveAppliedAiHistory(repo, ai, applied));
      } catch (nextError) {
        if (nextError instanceof DOMException && nextError.name === "AbortError") break;
        const message = getErrorMessage(nextError);
        setRankingAiProgress({
          running: false,
          current: index + 1,
          total: activeRanking.repos.length,
          message: `分析停在 ${rankedRepo.name}`,
          error: message,
        });
        rankingAiAbortRef.current = null;
        return;
      }
    }

    if (!controller.signal.aborted) {
      setRankingAiProgress({
        running: false,
        current: activeRanking.repos.length,
        total: activeRanking.repos.length,
        message: `已完成当前榜单 ${activeRanking.repos.length} 个项目的 AI 分析`,
        error: null,
      });
    } else {
      setRankingAiProgress((current) => ({ ...current, running: false, message: "已停止榜单 AI 分析" }));
    }
    rankingAiAbortRef.current = null;
  }

  function handleCloseRankings() {
    rankingAiAbortRef.current?.abort();
    rankingAiAbortRef.current = null;
    setRankingAiProgress((current) => (current.running ? { ...current, running: false, message: "已停止榜单 AI 分析" } : current));
    setShowRankings(false);
  }

  function handleSaveToken() {
    try {
      if (!token.trim()) return;
      localStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
      localStorage.setItem(REMEMBER_TOKEN_STORAGE_KEY, "true");
      setRememberToken(true);
      setTokenSaved(true);
    } catch {
      setError("浏览器拒绝写入本地存储，Token 未保存。");
    }
  }

  function handleClearToken() {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(REMEMBER_TOKEN_STORAGE_KEY);
      setRememberToken(false);
      setTokenSaved(false);
    } catch {
      setError("浏览器拒绝访问本地存储，Token 未清除。");
    }
  }

  function handleRememberTokenChange(checked: boolean) {
    if (checked) {
      handleSaveToken();
      return;
    }
    handleClearToken();
  }

  function handleSaveUsername() {
    try {
      if (!safeUsername) return;
      localStorage.setItem(USERNAME_STORAGE_KEY, safeUsername);
      localStorage.setItem(REMEMBER_USERNAME_STORAGE_KEY, "true");
      setRememberUsername(true);
      setUsernameSaved(true);
      setSavedUsername(safeUsername);
    } catch {
      setError("浏览器拒绝写入本地存储，用户名未保存。");
    }
  }

  function handleClearUsername() {
    try {
      localStorage.removeItem(USERNAME_STORAGE_KEY);
      localStorage.removeItem(REMEMBER_USERNAME_STORAGE_KEY);
      setRememberUsername(false);
      setUsernameSaved(false);
      setSavedUsername("");
    } catch {
      setError("浏览器拒绝访问本地存储，用户名未清除。");
    }
  }

  function handleRememberUsernameChange(checked: boolean) {
    if (checked) {
      handleSaveUsername();
      return;
    }
    handleClearUsername();
  }

  function handleSaveAiConfig() {
    if (!aiConfig.apiKey.trim() || !aiConfig.baseUrl.trim()) {
      setError("请同时填写 AI API Key 和 Base URL。临时配置不会自动保存。");
      return;
    }
    saveAiConfig(aiConfig);
    setRememberAiConfig(true);
    setAiConfigSaved(true);
  }

  function handleClearAiConfig() {
    clearAiConfig();
    setAiConfig(EMPTY_AI_CONFIG);
    setRememberAiConfig(false);
    setAiConfigSaved(false);
  }

  function handleRememberAiConfigChange(checked: boolean) {
    if (checked) {
      handleSaveAiConfig();
      return;
    }
    handleClearAiConfig();
  }

  async function handleAnalyze() {
    if ((targetMode === "public" && !safeUsername) || (targetMode === "authenticated" && !activeToken) || isLoading) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setUser(null);
    setAnalyses([]);
    setResultsView("analysis");
    setSyncSummary(null);
    setProgress({
      phase: "user",
      current: 0,
      total: 0,
      message: targetMode === "authenticated" ? "正在读取 Token 所属账号资料" : `正在读取 @${safeUsername} 的公开资料`,
    });
    let aiReused = 0;
    let aiAnalyzed = 0;

    try {
      const userResult =
        targetMode === "authenticated"
          ? await fetchAuthenticatedUser(activeToken, controller.signal)
          : await fetchUser(safeUsername, activeToken || undefined, controller.signal);
      setUser(userResult.data);
      setRateLimit(userResult.rateLimit);
      setProgress({
        phase: "stars",
        current: 0,
        total: 0,
        message: targetMode === "authenticated" ? "正在分页读取 Token 可见的 starred repositories" : "正在分页读取公开 starred repositories",
      });

      const onStarPage = (page: number, totalPages: number | null, nextRateLimit: RateLimitInfo) => {
        setRateLimit(nextRateLimit);
        setProgress({
          phase: "stars",
          current: page,
          total: totalPages || page,
          message: totalPages ? `正在读取 star 列表，第 ${page} / ${totalPages} 页` : `正在读取 star 列表，第 ${page} 页`,
        });
      };
      const repos =
        targetMode === "authenticated"
          ? await fetchAuthenticatedStarredRepos(activeToken, controller.signal, onStarPage)
          : await fetchStarredRepos(safeUsername, activeToken || undefined, controller.signal, onStarPage);

      const nextSyncSummary = compareAndStoreStarredRepos(targetMode, userResult.data.login, repos);
      setSyncSummary(nextSyncSummary);

      const reposForReadme = maxRepos > 0 ? repos.slice(0, maxRepos) : repos;
      const metadataOnly = repos.slice(reposForReadme.length).map((repo) => analyzeRepository(repo, null, "skipped", null));

      setAnalyses(metadataOnly);
      setProgress({
        phase: "code",
        current: 0,
        total: reposForReadme.length,
        message: `正在分析 README、仓库结构和关键配置，目标 ${deepAnalysisTotal} 个项目`,
      });

      const completed: RepoAnalysis[] = [];
      let aiBlockedReason: string | null = null;
      for (let index = 0; index < reposForReadme.length; index += 1) {
        controller.signal.throwIfAborted();
        const repo = reposForReadme[index];

        setProgress({
          phase: "code",
          current: index + 1,
          total: reposForReadme.length,
          message: `正在读取 ${repo.full_name} 的 README 和代码画像`,
        });

        try {
          const [readmeSettled, codeSettled] = await Promise.allSettled([
            fetchReadme(repo, activeToken || undefined, controller.signal),
            fetchCodeContext(repo, activeToken || undefined, controller.signal),
          ]);

          if (readmeSettled.status === "rejected" && readmeSettled.reason instanceof DOMException && readmeSettled.reason.name === "AbortError") {
            throw readmeSettled.reason;
          }
          if (codeSettled.status === "rejected" && codeSettled.reason instanceof DOMException && codeSettled.reason.name === "AbortError") {
            throw codeSettled.reason;
          }

          const readme = readmeSettled.status === "fulfilled" ? readmeSettled.value.readme : null;
          const readmeStatus = readmeSettled.status === "fulfilled" ? readmeSettled.value.status : "error";
          const codeContext: RepoCodeContext | null = codeSettled.status === "fulfilled" ? codeSettled.value.context : null;
          const nextRateLimit =
            codeSettled.status === "fulfilled"
              ? codeSettled.value.rateLimit
              : readmeSettled.status === "fulfilled"
                ? readmeSettled.value.rateLimit
                : readmeSettled.reason instanceof GitHubApiError
                  ? readmeSettled.reason.rateLimit
                  : null;
          if (nextRateLimit) setRateLimit(nextRateLimit);

          const partialErrors = [
            readmeSettled.status === "rejected" ? getErrorMessage(readmeSettled.reason) : null,
            codeSettled.status === "rejected" ? getErrorMessage(codeSettled.reason) : null,
          ].filter(Boolean);

          const baseAnalysis = analyzeRepository(repo, readme, readmeStatus, codeContext, partialErrors.join("；") || undefined);

          if (useAiAnalysis) {
            const cached = findAiHistory(repo);
            if (cached) {
              aiReused += 1;
              setProgress({
                phase: "code",
                current: index + 1,
                total: reposForReadme.length,
                message: `复用 AI 历史：${repo.full_name}`,
              });
              completed.push(applyAiAnalysis(baseAnalysis, cached.analysis));
              setAnalyses([...completed, ...metadataOnly]);
              continue;
            }

            if (aiBlockedReason) {
              setProgress({
                phase: "code",
                current: index + 1,
                total: reposForReadme.length,
                message: `AI 暂不可用，使用规则分析：${repo.full_name}`,
              });
              completed.push(baseAnalysis);
              setAnalyses([...completed, ...metadataOnly]);
              continue;
            }

            try {
              aiAnalyzed += 1;
              setProgress({
                phase: "code",
                current: index + 1,
                total: reposForReadme.length,
                message: `正在用 AI 精修 ${repo.full_name} 的中文介绍`,
              });
              const ai = await requestAiRepositoryAnalysis(repo, readme, codeContext, baseAnalysis, controller.signal, aiConfig);
              const applied = applyAiAnalysis(baseAnalysis, ai);
              try {
                setAiHistory(saveAppliedAiHistory(repo, ai, applied));
              } catch {
                setError("AI 分析已完成，但历史保存失败。本机空间可能不足，请导出已有历史后整理空间。");
              }
              completed.push(applied);
            } catch (aiError) {
              controller.signal.throwIfAborted();
              aiBlockedReason = getErrorMessage(aiError);
              setError(`AI 精准分析暂不可用：${aiBlockedReason}。后续项目已自动切换为规则分析，Star 同步和代码画像仍会继续。`);
              completed.push(baseAnalysis);
            }
          } else {
            completed.push(baseAnalysis);
          }
        } catch (analysisError) {
          if (analysisError instanceof DOMException && analysisError.name === "AbortError") throw analysisError;
          const message = getErrorMessage(analysisError);
          const nextRateLimit = analysisError instanceof GitHubApiError ? analysisError.rateLimit : null;
          if (nextRateLimit) setRateLimit(nextRateLimit);
          completed.push(analyzeRepository(repo, null, "error", null, message));
        }

        setAnalyses([...completed, ...metadataOnly]);
      }

      setProgress({
        phase: "done",
        current: reposForReadme.length,
        total: reposForReadme.length,
        message: `完成 ${repos.length} 个 starred repository 的分析`,
      });
      const finalAnalyses = [...completed, ...metadataOnly];
      const finalSyncSummary = { ...nextSyncSummary, aiReused, aiAnalyzed };
      setAnalyses(finalAnalyses);
      setSyncSummary(finalSyncSummary);
      saveLastAnalysis({
        savedAt: new Date().toISOString(),
        targetMode,
        user: userResult.data,
        analyses: finalAnalyses,
        syncSummary: finalSyncSummary,
      });
    } catch (nextError) {
      const message = getErrorMessage(nextError);
      setError(message);
      setProgress({
        phase: nextError instanceof DOMException && nextError.name === "AbortError" ? "idle" : "error",
        current: progress.current,
        total: progress.total,
        message,
      });
      setSyncSummary((current) => (current ? { ...current, aiReused, aiAnalyzed } : current));
    } finally {
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleReset() {
    abortRef.current?.abort();
    clearLastAnalysis();
    setUser(null);
    setAnalyses([]);
    setError(null);
    setRateLimit(null);
    setProgress(DEFAULT_PROGRESS);
    setQuery("");
    setCategory("all");
    setSortMode("starred");
    setUsageFilter("all");
    setIncludeArchived(true);
    setResultsView("analysis");
  }

  function handleDeleteHistory(key: string) {
    setAiHistory(deleteAiHistoryRecord(key));
  }

  function handleClearHistory() {
    setAiHistory(clearAiHistory());
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="control-panel" aria-label="GitHub 分析控制台">
          <div className="brand-row">
            <span className="brand-mark" aria-hidden="true">
              <GitBranch size={22} />
            </span>
            <div>
              <h1>GitHub Star Manager</h1>
              <p>读取公开 Star，提炼项目用途和上手方式</p>
            </div>
          </div>

          <div className="field-stack">
            <label>分析模式</label>
            <div className="mode-grid" aria-label="分析模式">
              <button type="button" className={targetMode === "public" ? "active" : ""} onClick={() => setTargetMode("public")} disabled={isLoading}>
                公开用户名
              </button>
              <button type="button" className={targetMode === "authenticated" ? "active" : ""} onClick={() => setTargetMode("authenticated")} disabled={isLoading}>
                我的可见 Star
              </button>
            </div>
            <p className="hint">
              公开用户名可分析任意用户公开 Star；我的可见 Star 使用 token 读取当前账号有权限看到的项目。
            </p>
          </div>

          <div className="field-stack">
            <label htmlFor="username">GitHub 用户名</label>
            <div className="input-shell">
              <GitBranch size={18} />
              <input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder={targetMode === "authenticated" ? "认证模式会自动读取 token 所属账号" : "例如 Never-error"}
                autoComplete="off"
                disabled={isLoading || targetMode === "authenticated"}
              />
            </div>
            {targetMode === "public" && (
              <div className="sample-row" aria-label="快速填入示例用户">
                {SAMPLE_USERS.map((sample) => (
                  <button key={sample} type="button" onClick={() => setUsername(sample)} disabled={isLoading}>
                    {sample}
                  </button>
                ))}
              </div>
            )}
            {targetMode === "public" && (
              <div className="token-actions">
                <label className="checkbox-row compact">
                  <input
                    type="checkbox"
                    checked={rememberUsername && savedUsername === safeUsername}
                    onChange={(event) => handleRememberUsernameChange(event.target.checked)}
                    disabled={!safeUsername}
                  />
                  <span>{usernameSaved && savedUsername === safeUsername ? "已保存" : "记住用户名"}</span>
                </label>
                <button type="button" onClick={handleSaveUsername} disabled={!safeUsername} title="保存用户名到本机浏览器">
                  <Save size={15} />
                  保存
                </button>
                <button type="button" onClick={handleClearUsername} disabled={!savedUsername} title="清除已保存用户名">
                  <Trash2 size={15} />
                  清除
                </button>
              </div>
            )}
          </div>

          <div className="field-stack">
            <label htmlFor="token">Personal Access Token</label>
            <div className="input-shell">
              <KeyRound size={18} />
              <input
                id="token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="可选，分析大量 star 时推荐"
                type="password"
                autoComplete="off"
                disabled={isLoading}
              />
            </div>
            <p className="hint">
              Token 可选择保存到本机浏览器，用于提高 GitHub API 速率限制。
            </p>
            <div className="token-actions">
              <label className="checkbox-row compact">
                <input type="checkbox" checked={rememberToken} onChange={(event) => handleRememberTokenChange(event.target.checked)} disabled={!token.trim()} />
                <span>{tokenSaved ? "已保存" : "记住 Token"}</span>
              </label>
              <button type="button" onClick={handleSaveToken} disabled={!token.trim()} title="保存 Token 到本机浏览器">
                <Save size={15} />
                保存
              </button>
              <button type="button" onClick={handleClearToken} disabled={!tokenSaved && !rememberToken} title="清除已保存 Token">
                <Trash2 size={15} />
                清除
              </button>
            </div>
          </div>

          <div className="field-stack">
            <label htmlFor="maxRepos">深度分析范围</label>
            <div className="input-shell">
              <BookOpen size={18} />
              <input
                id="maxRepos"
                value={String(maxRepos)}
                onChange={(event) => setMaxRepos(Math.max(0, Number(event.target.value) || 0))}
                placeholder="0 表示全部"
                type="number"
                min="0"
                step="10"
                disabled={isLoading}
              />
            </div>
            <label className="checkbox-row">
              <input type="checkbox" checked={useAiAnalysis} onChange={(event) => setUseAiAnalysis(event.target.checked)} disabled={isLoading} />
              <span>AI 精准分析中文介绍</span>
            </label>
            <p className="hint">填 0 会分析全部 Star；开启 AI 后会优先复用历史，只为新增或更新的项目消耗 token。</p>
            <div className="ai-config-block">
              <div className="ai-config-heading">
                <span>
                  <Sparkles size={14} />
                  AI 服务设置
                </span>
                <small>{aiConfigSaved ? "已保存" : aiConfig.apiKey.trim() ? "临时配置" : "使用服务端默认"}</small>
              </div>
              <div className="ai-config-fields">
                <input
                  aria-label="AI API Key"
                  type="password"
                  value={aiConfig.apiKey}
                  onChange={(event) => {
                    setAiConfig((current) => ({ ...current, apiKey: event.target.value }));
                    setAiConfigSaved(false);
                    setRememberAiConfig(false);
                  }}
                  placeholder="API Key（可选）"
                  autoComplete="off"
                  disabled={isLoading}
                />
                <input
                  aria-label="AI Base URL"
                  value={aiConfig.baseUrl}
                  onChange={(event) => {
                    setAiConfig((current) => ({ ...current, baseUrl: event.target.value }));
                    setAiConfigSaved(false);
                    setRememberAiConfig(false);
                  }}
                  placeholder="Base URL，如 https://co.agentrouter.org/v1"
                  autoComplete="off"
                  disabled={isLoading}
                />
              </div>
              <div className="token-actions">
                <label className="checkbox-row compact">
                  <input type="checkbox" checked={rememberAiConfig} onChange={(event) => handleRememberAiConfigChange(event.target.checked)} disabled={!aiConfig.apiKey.trim() || !aiConfig.baseUrl.trim() || isLoading} />
                  <span>{aiConfigSaved ? "已记住" : "记住配置"}</span>
                </label>
                <button type="button" onClick={handleSaveAiConfig} disabled={!aiConfig.apiKey.trim() || !aiConfig.baseUrl.trim() || isLoading} title="保存 AI 配置到本机浏览器">
                  <Save size={15} />
                  保存
                </button>
                <button type="button" onClick={handleClearAiConfig} disabled={!aiConfig.apiKey && !aiConfig.baseUrl} title="清除本机保存的 AI 配置">
                  <Trash2 size={15} />
                  清除
                </button>
              </div>
              <p className="hint">不勾选“记住配置”时，Key 只在当前页面内存中使用；AgentRouter 请填 https://co.agentrouter.org/v1，其他服务填兼容 OpenAI Chat Completions 的根地址。</p>
            </div>
            <div className="history-block">
              <div className="history-head">
                <button type="button" onClick={() => setShowHistory((value) => !value)} disabled={isLoading}>
                  {showHistory ? "收起历史" : "AI 历史"}
                </button>
                <span>{aiHistory.length} 条</span>
                <button type="button" onClick={() => setResultsView("history")} disabled={isLoading}>
                  打开
                </button>
                <button type="button" onClick={handleClearHistory} disabled={!aiHistory.length || isLoading}>
                  清空
                </button>
              </div>
              {showHistory && (
                <div className="history-list">
                  {aiHistory.length ? (
                    aiHistory.slice(0, 8).map((record) => (
                      <div className="history-item" key={record.key}>
                        <img src={record.avatarUrl} alt="" aria-hidden="true" />
                        <div>
                          <strong>{record.repoFullName}</strong>
                          <span>{record.projectKindZh}</span>
                        </div>
                        <button type="button" onClick={() => handleDeleteHistory(record.key)} disabled={isLoading} aria-label={`删除 ${record.repoFullName} 的 AI 历史`}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="history-empty">还没有 AI 历史记录</p>
                  )}
                  {aiHistory.length > 8 && <p className="history-empty">左侧只显示最近 8 条，点击打开查看全部。</p>}
                </div>
              )}
            </div>
          </div>

          <div className="button-grid">
            <button className="primary-button" type="button" onClick={handleAnalyze} disabled={!canAnalyze || isLoading}>
              {isLoading ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
              <span>{isLoading ? "分析中" : "开始分析"}</span>
            </button>
            <button className="icon-button" type="button" onClick={handleStop} disabled={!isLoading} aria-label="停止分析" title="停止分析">
              <CircleStop size={18} />
            </button>
            <button className="icon-button" type="button" onClick={handleReset} disabled={isLoading} aria-label="清空结果" title="清空结果">
              <RefreshCw size={18} />
            </button>
          </div>

          <div className="status-block" data-phase={progress.phase}>
            <div className="status-line">
              {progress.phase === "done" ? <CheckCircle2 size={18} /> : progress.phase === "error" ? <AlertCircle size={18} /> : <ShieldCheck size={18} />}
              <span>{progress.message}</span>
            </div>
            {progress.phase !== "idle" && (
              <div className="progress-track" aria-label="分析进度">
                <span style={{ width: `${progressPercent}%` }} />
              </div>
            )}
            <div className="status-meta">
              <span>{progress.total ? `${progress.current} / ${progress.total}` : "等待任务"}</span>
              <span>{getRateLimitText(rateLimit)}</span>
            </div>
          </div>

          {error && (
            <div className="error-box" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {user && (
            <div className="profile-block">
              <img src={user.avatar_url} alt={`${user.login} avatar`} />
              <div>
                <strong>{user.name || user.login}</strong>
                <a href={user.html_url} target="_blank" rel="noreferrer">
                  @{user.login}
                  <ExternalLink size={13} />
                </a>
              </div>
              <p>{user.bio || "这个用户没有公开 bio。"}</p>
              <div className="mini-metrics">
                <span>
                  <Users size={15} />
                  {formatNumber(user.followers)}
                </span>
                <span>
                  <Code2 size={15} />
                  {formatNumber(user.public_repos)}
                </span>
              </div>
            </div>
          )}
        </aside>

        <section className="results-panel">
          <header className="results-header">
            <div>
              <span className="results-kicker">GitHub intelligence</span>
              <h2>{resultsView === "history" ? "AI 分析历史" : "Star 项目画像"}</h2>
            </div>
            <button className="ranking-button" type="button" onClick={handleOpenRankings} disabled={rankingLoading}>
              {rankingLoading ? <Loader2 className="spin" size={17} /> : <Trophy size={17} />}
              榜单分析
            </button>
          </header>
          {resultsView === "history" ? (
            <HistoryResultsView
              records={aiHistory}
              onImport={setAiHistory}
              isLoading={isLoading}
              onBack={() => setResultsView("analysis")}
              onDelete={handleDeleteHistory}
              onClear={handleClearHistory}
            />
          ) : (
            <>
              {syncSummary && <SyncSummaryBanner summary={syncSummary} />}
              <div className="toolbar">
                <div className="search-shell">
                  <Search size={18} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目、用途、语言或 topic" />
                </div>
                <label className="select-shell">
                  <Filter size={17} />
                  <select value={category} onChange={(event) => setCategory(event.target.value as AnalysisCategory | "all")}>
                    <option value="all">全部方向</option>
                    {CATEGORY_ORDER.map((item) => (
                      <option key={item} value={item}>
                        {CATEGORY_LABELS[item]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} />
                </label>
                <label className="select-shell">
                  <BarChart3 size={17} />
                  <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                    <option value="starred">Star 顺序</option>
                    <option value="stars">项目热度</option>
                    <option value="updated">最近更新</option>
                    <option value="confidence">分析置信度</option>
                  </select>
                  <ChevronDown size={16} />
                </label>
              </div>

              <div className="switch-row">
                <div className="segmented" aria-label="使用方式来源筛选">
                  <button type="button" className={usageFilter === "all" ? "active" : ""} onClick={() => setUsageFilter("all")}>
                    全部
                  </button>
                  <button type="button" className={usageFilter === "readme" ? "active" : ""} onClick={() => setUsageFilter("readme")}>
                    README 提取
                  </button>
                  <button type="button" className={usageFilter === "code" ? "active" : ""} onClick={() => setUsageFilter("code")}>
                    代码画像
                  </button>
                  <button type="button" className={usageFilter === "inferred" ? "active" : ""} onClick={() => setUsageFilter("inferred")}>
                    规则推断
                  </button>
                </div>
                <label className="checkbox-row">
                  <input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
                  <span>包含归档项目</span>
                </label>
              </div>

              <section className="overview-band" aria-label="分析概览">
                <Metric icon={<Star size={18} />} label="Star 项目" value={formatNumber(stats.totalRepos)} />
                <Metric icon={<GitBranch size={18} />} label="项目总热度" value={formatNumber(stats.totalStars)} />
                <Metric icon={<BookOpen size={18} />} label="README 已读" value={formatNumber(stats.loadedReadmes)} />
                <Metric icon={<Code2 size={18} />} label="代码画像" value={formatNumber(stats.loadedCode)} />
              </section>

              <section className="insight-grid" aria-label="可视化分布">
                <div className="insight-panel">
                  <div className="panel-heading">
                    <h2>方向分布</h2>
                    <span>{categoryLabel(category)}</span>
                  </div>
                  <div className="category-bars">
                    {stats.categories.length ? (
                      stats.categories.map(([item, count]) => (
                        <div key={item} className="bar-row">
                          <span className="bar-label">
                            <i style={{ backgroundColor: CATEGORY_COLORS[item] }} />
                            {CATEGORY_LABELS[item]}
                          </span>
                          <span className="bar-track">
                            <span style={{ width: `${Math.max(8, (count / topCategoryCount) * 100)}%`, backgroundColor: CATEGORY_COLORS[item] }} />
                          </span>
                          <b>{count}</b>
                        </div>
                      ))
                    ) : (
                      <EmptyState compact title="暂无方向数据" />
                    )}
                  </div>
                </div>

                <div className="insight-panel">
                  <div className="panel-heading">
                    <h2>语言与标签</h2>
                    <span>{stats.languages[0]?.[0] || "等待分析"}</span>
                  </div>
                  <div className="language-list">
                    {stats.languages.length ? (
                      stats.languages.map(([language, count]) => (
                        <div key={language}>
                          <span>{language}</span>
                          <span className="language-track">
                            <span style={{ width: `${Math.max(8, (count / topLanguageCount) * 100)}%` }} />
                          </span>
                          <b>{count}</b>
                        </div>
                      ))
                    ) : (
                      <EmptyState compact title="暂无语言数据" />
                    )}
                  </div>
                  {stats.topics.length > 0 && (
                    <div className="topic-cloud">
                      {stats.topics.map(([topic, count]) => (
                        <span key={topic}>
                          {topic}
                          <b>{count}</b>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="repo-section" aria-label="项目分析列表">
                <div className="section-heading">
                  <div>
                    <h2>项目分析</h2>
                    <p>{filteredAnalyses.length ? `当前显示 ${filteredAnalyses.length} / ${analyses.length} 个项目` : "分析结果会显示在这里"}</p>
                  </div>
                </div>

                {filteredAnalyses.length ? (
                  <div className="repo-grid">
                    {filteredAnalyses.map((item) => (
                      <RepositoryCard key={item.repo.id} analysis={item} />
                    ))}
                  </div>
                ) : (
                  <EmptyState title={analyses.length ? "没有匹配的项目" : "还没有分析结果"} />
                )}
              </section>
            </>
          )}
        </section>
      </section>
      {showRankings && (
        <StarHistoryModal
          rankings={rankings}
          activeTab={rankingTab}
          rankingRepos={rankingRepos}
          aiAnalyses={rankingAiAnalyses}
          aiProgress={rankingAiProgress}
          existingAnalyses={analyses}
          loading={rankingLoading}
          metadataLoading={rankingReposLoading}
          error={rankingError}
          onTabChange={handleRankingTabChange}
          onRefresh={() => void loadRankings(true)}
          onAiAnalyze={() => void handleRankingAiAnalyze()}
          onClose={handleCloseRankings}
        />
      )}
    </main>
  );
}

function formatCompactNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}k`;
  return formatNumber(value);
}

function RankingChange({ value }: { value: number | null }) {
  if (value === null) return <span className="rank-change neutral">新上榜</span>;
  if (value > 0) {
    return (
      <span className="rank-change up">
        <ArrowUp size={13} /> 上升 {value}
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="rank-change down">
        <ArrowDown size={13} /> 下降 {Math.abs(value)}
      </span>
    );
  }
  return (
    <span className="rank-change neutral">
      <Minus size={13} /> 持平
    </span>
  );
}

const RANKING_CATEGORY_SUMMARIES: Record<AnalysisCategory, string> = {
  ai: "主要围绕人工智能模型、智能代理或 AI 应用工作流提供能力",
  frontend: "主要面向网页界面、交互体验或前端开发场景",
  backend: "主要提供服务端能力、接口服务或业务后端组件",
  devtools: "主要帮助开发者改进编码、构建、调试或项目管理流程",
  data: "主要用于数据处理、数据存储、检索或分析工作",
  infra: "主要用于部署、基础设施、系统运行或自动化运维",
  mobile: "主要面向移动端、桌面端或跨平台应用开发",
  docs: "主要提供学习资料、项目清单、教程或知识整理",
  testing: "主要用于自动化测试、代码质量或安全检查",
  media: "主要处理图像、音视频、三维图形或多媒体内容",
  productivity: "主要用于提升个人效率、办公或日常内容处理体验",
  general: "这是一个受到较多开发者关注的通用开源项目",
};

function getRankingSummaryZh(repo: GitHubRepo | undefined, analysis: RepoAnalysis | null, fullName: string) {
  if (analysis?.analysisEngine === "ai") return analysis.purposeZh;
  if (repo?.description && /[\u3400-\u9fff]/.test(repo.description)) return repo.description;

  const category = analysis?.category || "general";
  const projectKind = analysis?.projectKindZh || "开源项目";
  const languageText = repo?.language ? `主要语言是 ${repo.language}` : "暂未识别主要语言";
  const topicText = repo?.topics?.length ? `，相关主题包括 ${repo.topics.slice(0, 4).join("、")}` : "";
  return `${fullName} 是一个${projectKind}，归类为「${CATEGORY_LABELS[category]}」。${RANKING_CATEGORY_SUMMARIES[category]}。从 GitHub 元数据看，${languageText}${topicText}。`;
}

function StarHistoryModal({
  rankings,
  activeTab,
  rankingRepos,
  aiAnalyses,
  aiProgress,
  existingAnalyses,
  loading,
  metadataLoading,
  error,
  onTabChange,
  onRefresh,
  onAiAnalyze,
  onClose,
}: {
  rankings: StarHistoryRankings | null;
  activeTab: RankingTab;
  rankingRepos: Record<string, GitHubRepo>;
  aiAnalyses: Record<string, RepoAnalysis>;
  aiProgress: RankingAiProgress;
  existingAnalyses: RepoAnalysis[];
  loading: boolean;
  metadataLoading: boolean;
  error: string | null;
  onTabChange: (tab: RankingTab) => void;
  onRefresh: () => void;
  onAiAnalyze: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const existingByName = useMemo(() => new Map(existingAnalyses.map((item) => [item.repo.full_name.toLowerCase(), item])), [existingAnalyses]);
  const activeRanking = rankings?.[activeTab];
  const totalWeeklyStars = rankings?.weekly.repos.reduce((sum, item) => sum + (item.newStars || 0), 0) || 0;
  const totalAlltimeStars = rankings?.alltime.repos.reduce((sum, item) => sum + item.starsTotal, 0) || 0;
  const aiAnalyzedCount = activeRanking?.repos.filter((item) => {
    const key = item.name.toLowerCase();
    return Boolean(aiAnalyses[key]) || existingByName.get(key)?.analysisEngine === "ai";
  }).length || 0;

  return (
    <div className="ranking-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="ranking-modal" role="dialog" aria-modal="true" aria-labelledby="ranking-modal-title">
        <header className="ranking-modal-header">
          <div>
            <span className="ranking-eyebrow">
              <Trophy size={14} /> STAR HISTORY / GITHUB
            </span>
            <h2 id="ranking-modal-title">榜单分析</h2>
            <p>把 Star History 的周榜与总榜，整理成可读的 GitHub 项目雷达。</p>
          </div>
          <button className="modal-icon-button" type="button" onClick={onClose} aria-label="关闭榜单分析" title="关闭">
            <X size={19} />
          </button>
        </header>

        <div className="ranking-tabs" role="tablist" aria-label="Star History 榜单类型">
          <button type="button" role="tab" aria-selected={activeTab === "weekly"} className={activeTab === "weekly" ? "active" : ""} onClick={() => onTabChange("weekly")} disabled={aiProgress.running}>
            <span>周榜</span>
            <small>最近一周新增 Star</small>
          </button>
          <button type="button" role="tab" aria-selected={activeTab === "alltime"} className={activeTab === "alltime" ? "active" : ""} onClick={() => onTabChange("alltime")} disabled={aiProgress.running}>
            <span>总榜</span>
            <small>累计 Star 排名</small>
          </button>
        </div>

        {loading && !rankings ? (
          <div className="ranking-loading">
            <Loader2 className="spin" size={24} />
            <strong>正在读取 Star History 榜单</strong>
            <span>榜单数据会短暂缓存，避免重复请求外部站点。</span>
          </div>
        ) : error ? (
          <div className="ranking-error" role="alert">
            <AlertCircle size={20} />
            <div>
              <strong>榜单暂时读取失败</strong>
              <p>{error}</p>
              <button type="button" onClick={onRefresh} disabled={loading}>
                {loading ? "重试中" : "重新读取"}
              </button>
            </div>
          </div>
        ) : activeRanking ? (
          <>
            <div className="ranking-summary">
              <div>
                <span className="summary-label">榜单焦点</span>
                <strong>{activeRanking.repos[0]?.name || "暂无项目"}</strong>
                <small>{activeTab === "weekly" ? `本周新增 ${formatCompactNumber(activeRanking.repos[0]?.newStars || 0)} Star` : `累计 ${formatCompactNumber(activeRanking.repos[0]?.starsTotal || 0)} Star`}</small>
              </div>
              <div>
                <span className="summary-label">Top 20 规模</span>
                <strong>{formatCompactNumber(activeTab === "weekly" ? totalWeeklyStars : totalAlltimeStars)}</strong>
                <small>{activeTab === "weekly" ? "本周新增 Star 合计" : "累计 Star 合计"}</small>
              </div>
              <div>
                <span className="summary-label">数据状态</span>
                <strong>{metadataLoading ? "补充 GitHub 信息" : "已更新"}</strong>
                <small>{rankings.fetchedAt ? `读取于 ${formatDate(rankings.fetchedAt)}` : "Star History"}</small>
              </div>
            </div>

            <div className="ranking-list-head">
              <div>
                <strong>{activeTab === "weekly" ? "Weekly movers" : "All-time leaders"}</strong>
                <span>{activeTab === "weekly" ? `${rankings.weekly.from || "最近一周"} – ${rankings.weekly.to || "现在"}` : `更新于 ${rankings.alltime.updatedAt || "最近"}`}</span>
              </div>
              <div className="ranking-list-actions">
                <button className="ranking-ai-button" type="button" onClick={onAiAnalyze} disabled={loading || aiProgress.running || !activeRanking.repos.length} title="使用当前 AI 配置分析本页项目">
                  {aiProgress.running ? <Loader2 className="spin" size={15} /> : <Sparkles size={15} />}
                  {aiProgress.running ? `AI 分析 ${aiProgress.current}/${aiProgress.total}` : `AI 分析${aiAnalyzedCount ? ` ${aiAnalyzedCount}/${activeRanking.repos.length}` : ""}`}
                </button>
                <button className="ranking-refresh" type="button" onClick={onRefresh} disabled={loading || aiProgress.running} title="刷新榜单">
                  {loading ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />}
                  刷新
                </button>
              </div>
            </div>

            {(aiProgress.message || aiProgress.error) && (
              <div className={aiProgress.error ? "ranking-ai-status error" : "ranking-ai-status"}>
                <div>
                  {aiProgress.error ? <AlertCircle size={15} /> : <Sparkles size={15} />}
                  <span>{aiProgress.error ? `AI 分析失败：${aiProgress.error}` : aiProgress.message}</span>
                </div>
                {aiProgress.total > 0 && (
                  <span className="ranking-ai-progress-track">
                    <span style={{ width: `${Math.round((aiProgress.current / aiProgress.total) * 100)}%` }} />
                  </span>
                )}
              </div>
            )}

            <div className="ranking-list">
              {activeRanking.repos.map((item, index) => {
                const key = item.name.toLowerCase();
                const metadata = rankingRepos[key];
                const existing = existingByName.get(key);
                const aiAnalysis = aiAnalyses[key];
                const derived = aiAnalysis || existing || (metadata ? analyzeRepository(metadata, null, "missing", null) : null);
                return (
                  <article className="ranking-card" key={item.name}>
                    <div className="ranking-card-topline">
                      <span className="ranking-number">{String(index + 1).padStart(2, "0")}</span>
                      <div className="ranking-name-wrap">
                        <a href={`https://github.com/${item.name}`} target="_blank" rel="noreferrer" className="ranking-name">
                          {item.name}
                          <ExternalLink size={13} />
                        </a>
                        <span>{metadata?.language || derived?.frameworkStack[0] || "GitHub repository"}</span>
                      </div>
                      <strong className="ranking-metric">{activeTab === "weekly" ? `+${formatCompactNumber(item.newStars || 0)}` : formatCompactNumber(item.starsTotal)}</strong>
                    </div>
                    <div className="ranking-card-meta">
                      <span>{activeTab === "weekly" ? `累计 ${formatCompactNumber(item.starsTotal)} Star` : "累计 Star"}</span>
                      <RankingChange value={item.rankChange} />
                      {derived && <span className="ranking-category">{CATEGORY_LABELS[derived.category]}</span>}
                      {derived?.analysisEngine === "ai" && (
                        <span className="ranking-ai-badge">
                          <Sparkles size={12} /> AI 精修
                        </span>
                      )}
                    </div>
                    <p className="ranking-description">
                      {getRankingSummaryZh(metadata, derived, item.name)}
                    </p>
                    {metadata?.topics && metadata.topics.length > 0 && (
                      <div className="ranking-topics">
                        {metadata.topics.slice(0, 4).map((topic) => <span key={topic}>{topic}</span>)}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            <footer className="ranking-modal-footer">
              <span>榜单数据来自 GitHub Star History；Random 榜未接入。</span>
              <a href="https://www.star-history.com/" target="_blank" rel="noreferrer">
                打开 Star History
                <ExternalLink size={13} />
              </a>
            </footer>
          </>
        ) : null}
      </section>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="metric">
      <span>{icon}</span>
      <div>
        <b>{value}</b>
        <small>{label}</small>
      </div>
    </div>
  );
}

function SyncSummaryBanner({ summary }: { summary: SyncSummary }) {
  const changeCount = summary.added.length + summary.removed.length + summary.changed.length;
  const detailItems = [
    ...summary.added.slice(0, 3).map((repo) => ({ kind: "新增", repo })),
    ...summary.removed.slice(0, 3).map((repo) => ({ kind: "移除", repo })),
    ...summary.changed.slice(0, 3).map((repo) => ({ kind: "更新", repo })),
  ];

  return (
    <section className="sync-banner" aria-label="Star 同步状态">
      <span className="sync-banner-icon" aria-hidden="true">
        <RefreshCw size={18} />
      </span>
      <div className="sync-banner-content">
        <div className="sync-banner-heading">
          <strong>Star 已同步</strong>
          <span>{summary.firstSync ? "首次建立快照" : changeCount ? `检测到 ${changeCount} 项变化` : "列表没有变化"}</span>
        </div>
        <p>
          {summary.firstSync
            ? `已为 ${summary.targetLogin} 建立 ${formatNumber(summary.currentCount)} 个项目的同步基线。`
            : `当前 ${formatNumber(summary.currentCount)} 个项目；新增 ${summary.added.length}，移除 ${summary.removed.length}，仓库内容更新 ${summary.changed.length}。`}
        </p>
        <div className="sync-stats">
          <span>AI 复用 {summary.aiReused}</span>
          <span>AI 新分析 {summary.aiAnalyzed}</span>
          <span>同步于 {formatDate(summary.syncedAt)}</span>
        </div>
        {detailItems.length > 0 && (
          <div className="sync-change-list">
            {detailItems.map(({ kind, repo }) => (
              <span key={`${kind}-${repo}`}>
                <b>{kind}</b>
                {repo}
              </span>
            ))}
            {changeCount > detailItems.length && <span>还有 {changeCount - detailItems.length} 项变化</span>}
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyState({ title, compact = false }: { title: string; compact?: boolean }) {
  return (
    <div className={compact ? "empty-state compact" : "empty-state"}>
      <GitBranch size={compact ? 20 : 30} />
      <span>{title}</span>
    </div>
  );
}

function UsageList({ title, items, commands = [] }: { title: string; items: string[]; commands?: string[] }) {
  const visibleItems = items.map((item) => item.trim()).filter(Boolean).slice(0, 6);

  if (!visibleItems.length) return null;

  return (
    <div className="usage-panel">
      <strong>{title}</strong>
      <ol>
        {visibleItems.map((item, index) => (
          <li key={`${title}-${index}`}>
            {commands.includes(item) ? <code>{item}</code> : item}
          </li>
        ))}
      </ol>
    </div>
  );
}

function HistoryResultsView({
  records,
  onImport,
  isLoading,
  onBack,
  onDelete,
  onClear,
}: {
  records: AiHistoryRecord[];
  onImport: (records: AiHistoryRecord[]) => void;
  isLoading: boolean;
  onBack: () => void;
  onDelete: (key: string) => void;
  onClear: () => void;
}) {
  const [historyQuery, setHistoryQuery] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const [backupMessage, setBackupMessage] = useState("");
  function exportBackup() {
    const url = URL.createObjectURL(new Blob([exportAiHistory(records)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `github-star-history-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const visibleRecords = useMemo(() => {
    const search = normalizeSearch(historyQuery);
    if (!search) return records;

    return records.filter((record) => {
      const analysis = record.analysis || {};
      const haystack = [
        record.repoFullName,
        record.owner,
        record.repoName,
        record.projectKindZh,
        record.purposeZh,
        analysis.projectKindZh,
        analysis.projectKindEn,
        analysis.purposeZh,
        analysis.purposeEn,
        analysis.category,
        ...(analysis.frameworkStack || []),
        ...(analysis.architecture || []),
        ...(analysis.evidence || []),
        ...(analysis.usage || []),
        ...(analysis.usageEn || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  }, [historyQuery, records]);

  return (
    <section className="history-results" aria-label="AI 分析历史">
      <div className="history-results-head">
        <div className="section-heading">
          <div>
            <h2>AI 分析历史</h2>
            <p>这些记录会在下次分析同一仓库版本时自动复用，只为新增或更新的 Star 重新请求 AI。</p>
          </div>
        </div>
        <div className="history-results-actions">
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            try {
              if (file.size > 10 * 1024 * 1024) throw new Error("备份文件不能超过 10 MB");
              const next = importAiHistory(await file.text());
              onImport(next);
              setBackupMessage(`导入完成，现有 ${next.length} 条历史`);
            } catch (error) { setBackupMessage(error instanceof Error ? error.message : "导入失败"); }
          }} />
          <button type="button" onClick={() => importRef.current?.click()} disabled={isLoading} title="导入历史备份" aria-label="导入历史备份"><Upload size={17} /></button>
          <button type="button" onClick={exportBackup} disabled={!records.length} title="导出历史备份" aria-label="导出历史备份"><Download size={17} /></button>
          <button type="button" onClick={onBack}>
            返回分析
          </button>
          <button type="button" onClick={onClear} disabled={!records.length || isLoading}>
            清空历史
          </button>
        </div>
      </div>

      <div className="toolbar history-toolbar">
        <div className="search-shell">
          <Search size={18} />
          <input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="搜索历史项目、用途、框架或分类" />
        </div>
        <span className="history-count">
          {visibleRecords.length} / {records.length} 条
        </span>
      </div>

      {backupMessage && <p role="status">{backupMessage}</p>}

      {visibleRecords.length ? (
        <div className="repo-grid history-results-grid">
          {visibleRecords.map((record) => (
            <HistoryResultCard key={record.key} record={record} isLoading={isLoading} onDelete={onDelete} />
          ))}
        </div>
      ) : (
        <EmptyState title={records.length ? "没有匹配的历史记录" : "还没有 AI 历史记录"} />
      )}
    </section>
  );
}

function HistoryResultCard({
  record,
  isLoading,
  onDelete,
}: {
  record: AiHistoryRecord;
  isLoading: boolean;
  onDelete: (key: string) => void;
}) {
  const analysis = record.analysis || {};
  const category = getHistoryCategory(analysis.category || record.category);
  const confidence = Math.max(0, Math.min(100, Math.round(analysis.confidence || 0)));
  const projectKindZh = analysis.projectKindZh || record.projectKindZh || "AI 分析结果";
  const projectKindEn = analysis.projectKindEn || "AI analysis result";
  const purposeZh = analysis.purposeZh || record.purposeZh || "这条历史记录没有保存中文摘要。";
  const purposeEn = analysis.purposeEn || "No English summary was saved for this history record.";
  const frameworkStack = analysis.frameworkStack || [];
  const architecture = analysis.architecture || [];
  const evidence = analysis.evidence || [];
  const usage = analysis.usage || [];
  const usageEn = analysis.usageEn || [];

  return (
    <article className="repo-card history-result-card">
      <div className="repo-card-header">
        <div className="repo-title-group">
          <img src={record.avatarUrl} alt="" aria-hidden="true" />
          <div>
            <a className="repo-title" href={record.repoUrl} target="_blank" rel="noreferrer">
              {record.repoFullName}
              <ExternalLink size={14} />
            </a>
            <span>{formatDate(record.updatedAt)} 更新，{formatDate(record.analyzedAt)} 分析</span>
          </div>
        </div>
        <span className="confidence">{confidence}%</span>
      </div>

      <div className="repo-meta">
        <span className="category-pill" style={{ borderColor: CATEGORY_COLORS[category], color: CATEGORY_COLORS[category] }}>
          {CATEGORY_LABELS[category]}
        </span>
        <span>
          <Star size={14} />
          {formatNumber(record.stars)}
        </span>
        <span>AI 历史</span>
      </div>

      <div className="kind-row">
        <span>{projectKindZh}</span>
        <span>{projectKindEn}</span>
      </div>

      <div className="purpose-block">
        <div>
          <strong>中文</strong>
          <p>{purposeZh}</p>
        </div>
        <div>
          <strong>English</strong>
          <p>{purposeEn}</p>
        </div>
      </div>

      {(frameworkStack.length > 0 || architecture.length > 0) && (
        <div className="code-profile">
          {frameworkStack.length > 0 && (
            <div>
              <strong>框架</strong>
              <p>{frameworkStack.slice(0, 6).join(" / ")}</p>
            </div>
          )}
          {architecture.length > 0 && (
            <div>
              <strong>结构</strong>
              <p>{architecture.slice(0, 4).join("；")}</p>
            </div>
          )}
        </div>
      )}

      {evidence.length > 0 && (
        <div className="evidence-row">
          {evidence.slice(0, 3).map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      )}

      <div className="usage-block">
        <div className="usage-heading">
          <strong>使用方式 / Usage</strong>
          <span>AI 历史</span>
        </div>
        <div className="usage-columns">
          <UsageList title="中文" items={usage} />
          <UsageList title="English" items={usageEn} />
        </div>
      </div>

      <div className="repo-foot">
        <a href={record.repoUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={14} />
          仓库
        </a>
        <button type="button" onClick={() => onDelete(record.key)} disabled={isLoading}>
          <Trash2 size={14} />
          删除
        </button>
      </div>
    </article>
  );
}

function RepositoryCard({ analysis }: { analysis: RepoAnalysis }) {
  const { repo } = analysis;
  const usageBadge =
    analysis.usageSource === "readme"
      ? "README"
      : analysis.usageSource === "code"
        ? "代码画像"
        : analysis.usageSource === "metadata"
          ? "元数据"
          : "推断";
  const qualityBadge =
    analysis.sourceQuality === "code+readme"
      ? "代码+README"
      : analysis.sourceQuality === "code"
        ? "代码"
        : analysis.sourceQuality === "readme"
          ? "README"
          : "元数据";
  const engineBadge = analysis.analysisEngine === "ai" ? "AI 精修" : "规则分析";

  return (
    <article className="repo-card">
      <div className="repo-card-header">
        <div className="repo-title-group">
          <img src={repo.owner.avatar_url} alt="" aria-hidden="true" />
          <div>
            <a className="repo-title" href={repo.html_url} target="_blank" rel="noreferrer">
              {repo.full_name}
              <ExternalLink size={14} />
            </a>
            <span>{formatDate(repo.pushed_at)} 更新</span>
          </div>
        </div>
        <span className="confidence">{analysis.confidence}%</span>
      </div>

      <div className="repo-meta">
        <span className="category-pill" style={{ borderColor: CATEGORY_COLORS[analysis.category], color: CATEGORY_COLORS[analysis.category] }}>
          {CATEGORY_LABELS[analysis.category]}
        </span>
        <span>
          <Star size={14} />
          {formatNumber(repo.stargazers_count)}
        </span>
        {repo.archived && (
          <span>
            <Archive size={14} />
            已归档
          </span>
        )}
        <span>{qualityBadge}</span>
        <span>{engineBadge}</span>
      </div>

      <div className="kind-row">
        <span>{analysis.projectKindZh}</span>
        <span>{analysis.projectKindEn}</span>
      </div>

      <div className="purpose-block">
        <div>
          <strong>中文</strong>
          <p>{analysis.purposeZh}</p>
        </div>
        <div>
          <strong>English</strong>
          <p>{analysis.purposeEn}</p>
        </div>
      </div>

      <div className="signal-row">
        {analysis.signals.map((signal) => (
          <span key={signal}>{signal}</span>
        ))}
      </div>

      {(analysis.frameworkStack.length > 0 || analysis.architecture.length > 0 || analysis.keyFiles.length > 0) && (
        <div className="code-profile">
          {analysis.frameworkStack.length > 0 && (
            <div>
              <strong>框架</strong>
              <p>{analysis.frameworkStack.slice(0, 6).join(" / ")}</p>
            </div>
          )}
          {analysis.architecture.length > 0 && (
            <div>
              <strong>结构</strong>
              <p>{analysis.architecture.slice(0, 4).join("；")}</p>
            </div>
          )}
          {analysis.keyFiles.length > 0 && (
            <div>
              <strong>关键文件</strong>
              <p>{analysis.keyFiles.slice(0, 4).join("，")}</p>
            </div>
          )}
        </div>
      )}

      {analysis.evidence.length > 0 && (
        <div className="evidence-row">
          {analysis.evidence.slice(0, 3).map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      )}

      <div className="usage-block">
        <div className="usage-heading">
          <strong>使用方式 / Usage</strong>
          <span>{usageBadge}</span>
        </div>
        <div className="usage-columns">
          <UsageList title="中文" items={analysis.usage} commands={analysis.commands} />
          <UsageList title="English" items={analysis.usageEn} commands={analysis.commands} />
        </div>
      </div>

      {(repo.homepage || repo.license || analysis.error) && (
        <div className="repo-foot">
          {repo.homepage && (
            <a href={repo.homepage} target="_blank" rel="noreferrer">
              <LinkIcon size={14} />
              官网
            </a>
          )}
          {repo.license && <span>{repo.license.name}</span>}
          {analysis.error && <span className="warn-text">{analysis.error}</span>}
        </div>
      )}
    </article>
  );
}

export default App;
