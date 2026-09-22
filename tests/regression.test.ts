import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { analyzeRepository } from "../src/analyzer";
import { applyAiAnalysis } from "../src/ai";
import { exportAiHistory, findAiHistory, getRepoHistoryKey, importAiHistory, loadAiHistory, saveAiHistory } from "../src/history";
import { compareAndStoreStarredRepos } from "../src/sync";
import type { GitHubRepo, RepoCodeContext } from "../src/types";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
} });
beforeEach(() => storage.clear());
function repo(patch: Partial<GitHubRepo> = {}): GitHubRepo {
  return { id: 1, name: "sample", full_name: "example/sample", html_url: "https://github.com/example/sample", description: null, language: null, stargazers_count: 10, forks_count: 0, open_issues_count: 0, pushed_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", created_at: null, homepage: null, topics: [], archived: false, fork: false, default_branch: "main", owner: { login: "example", avatar_url: "" }, license: null, ...patch };
}
function context(files: string[], content = ""): RepoCodeContext {
  return { treeStatus: "loaded", files, directories: ["src", "docs"], languageBytes: {}, keyFiles: content ? [{ path: "package.json", content, truncated: false }] : [], truncated: false };
}

test("browser userscript is not a PDF utility even with doc links and iText-shaped identifiers", () => {
  const result = analyzeRepository(repo({ description: "Bilibili browser enhancement userscript", topics: ["bilibili", "tampermonkey"] }), "# Bilibili Evolved\n\nA browser enhancement tool.\n\n[doc](docs/manual.md)", "loaded", context(["src/UiText.ts"], '{"uiText":"document","dependencies":{"vue":"3"}}'));
  assert.equal(result.category, "frontend");
  assert.equal(result.projectKindEn, "browser userscript");
  assert.ok(!result.frameworkStack.includes("iText"));
});
test("a client project does not match CLI", () => {
  const result = analyzeRepository(repo({ description: "A client interface for project planning" }), null, "missing", context(["src/client.ts"], '{"dependencies":{"react":"19","vite":"8"}}'));
  assert.equal(result.projectKindEn, "web application or frontend project");
});
test("PDF utilities keep their office-tool classification", () => {
  const result = analyzeRepository(repo({ name: "Stirling-PDF", description: "A PDF tool to merge, split and convert PDF files" }), "# Stirling-PDF\n\nPDF tools.", "loaded", context(["Dockerfile"]));
  assert.equal(result.category, "productivity");
  assert.equal(result.projectKindEn, "PDF/document utility");
});
test("a supporting SKILL.md does not turn an API service into an agent skill", () => {
  const result = analyzeRepository(repo({ description: "An API gateway server for model requests", topics: ["api", "gateway"] }), "# Gateway\n\nAn API gateway.\n\n## Development\nCodex can use .codex/skills/SKILL.md.", "loaded", context([".codex/skills/SKILL.md", "server/main.py"]));
  assert.ok(!result.projectKindEn.toLowerCase().includes("skill"));
});
test("desktop products take precedence over their frontend framework", () => {
  const result = analyzeRepository(repo(), null, "missing", context(["tauri.conf.json"], '{"dependencies":{"react":"19","@tauri-apps/api":"2"}}'));
  assert.equal(result.projectKindEn, "desktop or mobile application");
});
test("known agent memory and context projects retain their product identity", () => {
  assert.match(analyzeRepository(repo({ name: "mempalace" }), null, "missing").projectKindEn, /memory/);
  assert.match(analyzeRepository(repo({ name: "Agent-Skills-for-Context-Engineering", description: "Agent skills for context engineering" }), null, "missing").projectKindEn, /context-engineering/);
});
test("AI output cannot crash arrays or force an unknown category, and can lower confidence", () => {
  const base = analyzeRepository(repo(), null, "missing");
  const result = applyAiAnalysis(base, { category: "invalid", usage: [null, 15, "step"], evidence: "bad", confidence: 12 } as never);
  assert.equal(result.category, base.category);
  assert.deepEqual(result.usage, ["step"]);
  assert.equal(result.confidence, 12);
  assert.ok(Array.isArray(result.evidence));
});
test("stars/updated_at changes reuse AI and do not mark source changes", () => {
  const original = repo();
  saveAiHistory(original, { purposeZh: "项目介绍", purposeEn: "Project summary" });
  compareAndStoreStarredRepos("public", "example", [original]);
  const changed = repo({ updated_at: "2026-09-22T00:00:00Z", stargazers_count: 999 });
  assert.equal(getRepoHistoryKey(original), getRepoHistoryKey(changed));
  assert.ok(findAiHistory(changed));
  assert.deepEqual(compareAndStoreStarredRepos("public", "example", [changed]).changed, []);
  assert.equal(findAiHistory(repo({ pushed_at: "2026-09-22T00:00:00Z" })), null);
  assert.equal(findAiHistory(repo({ description: "new purpose" })), null);
});
test("existing v2 history survives updated_at-only changes", () => {
  const original = repo();
  const [record] = saveAiHistory(original, { purposeZh: "旧分析" });
  record.key = ["v2", original.full_name, original.pushed_at, original.updated_at, original.description, original.default_branch, []].map(JSON.stringify).join("@");
  storage.set("github-star-manager-ai-history-v1", JSON.stringify([record]));
  assert.ok(findAiHistory(repo({ updated_at: "2026-09-22T00:00:00Z" })));
});
test("backup roundtrip merges duplicates and excludes credentials and unknown fields", () => {
  saveAiHistory(repo(), { purposeZh: "项目介绍", purposeEn: "Project summary" });
  const backup = JSON.parse(exportAiHistory());
  backup.records[0].apiKey = "private-value";
  backup.records[0].repoUrl = "javascript:alert(1)";
  backup.records[0].analysis.apiKey = "private-value";
  const records = importAiHistory(JSON.stringify(backup));
  assert.equal(records.length, 1);
  assert.equal(records[0].repoUrl, "https://github.com/example/sample");
  assert.ok(!exportAiHistory(records).includes("private-value"));
  assert.equal(importAiHistory(exportAiHistory()).length, 1);
});
test("invalid imports preserve stored records", () => {
  saveAiHistory(repo(), { purposeZh: "项目介绍" });
  const previous = exportAiHistory();
  assert.throws(() => importAiHistory('{"format":"github-star-manager-history","version":1,"records":[{}]}'));
  assert.equal(loadAiHistory().length, 1);
  assert.equal(JSON.parse(exportAiHistory()).records[0].key, JSON.parse(previous).records[0].key);
});
