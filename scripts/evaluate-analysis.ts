import { mkdir, readFile, writeFile } from "node:fs/promises";
import { loadEnv } from "vite";
import { analyzeRepository } from "../src/analyzer";
import { analysisMessages } from "../src/ai-prompt";
import { normalizeAiAnalysis } from "../src/ai-validation";
import { selectReadmeEvidence } from "../src/readme-evidence";
import { fetchRepositoryMetadata, fetchReadme, fetchCodeContext } from "../src/github";

// Explicit opt-in: this command sends public repository evidence to the configured AI.
const live = process.argv.includes("--live");
const refresh = process.argv.includes("--refresh");
const env = loadEnv("development", process.cwd(), "");
Object.defineProperty(globalThis, "window", { value: { fetch: globalThis.fetch } });
const names = process.argv.filter((arg) => /^[\w.-]+\/[\w.-]+$/.test(arg)).slice(0, 8);
if (!names.length) throw new Error("Provide owner/repo names; add --live to call AI (cached responses are reused).");
await mkdir(".local/evaluation", { recursive: true });
for (const name of names) {
  const path = `.local/evaluation/${name.replace("/", "--")}.json`;
  try {
    let sample;
    try { sample = JSON.parse(await readFile(path, "utf8")); } catch { /* First evaluation. */ }
    if (!sample) {
      const signal = AbortSignal.timeout(90000);
      const { data: repo } = await fetchRepositoryMetadata(name, env.GITHUB_TOKEN, signal);
      if ((repo as { private?: boolean }).private) throw new Error("Only public repositories can be evaluated");
      const { readme, status } = await fetchReadme(repo, env.GITHUB_TOKEN, signal);
      const { context } = await fetchCodeContext(repo, env.GITHUB_TOKEN, signal);
      sample = { repo, readme, status, context, fetchedAt: new Date().toISOString() };
    }
    if (refresh) delete sample.ai;
    const rule = analyzeRepository(sample.repo, sample.readme, sample.status, sample.context);
    sample.baseline ??= rule;
    await writeFile(path, JSON.stringify(sample, null, 2));
    if (live && !sample.ai) {
      if (!env.DEEPSEEK_API_KEY) throw new Error("No AI key configured");
      const payload = { repo: { full_name: sample.repo.full_name, description: sample.repo.description, topics: sample.repo.topics }, readme: selectReadmeEvidence(sample.readme), codeProfile: { treeStatus:sample.context.treeStatus, truncated:sample.context.truncated, files: sample.context.files.slice(0, 220), keyFiles: sample.context.keyFiles.map((file: {path:string;content:string}) => ({path:file.path,content:file.content.slice(0,4000)})) } };
      const response = await fetch(`${env.DEEPSEEK_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
        body: JSON.stringify({ model: env.DEEPSEEK_MODEL, temperature: 0.2, max_tokens: 6000, response_format: {type:"json_object"}, messages: analysisMessages(payload) }), signal: AbortSignal.timeout(150000),
      });
      if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      if (!content.includes("{")) throw new Error(`No JSON content; finish=${data.choices?.[0]?.finish_reason}, tokens=${data.usage?.completion_tokens}`);
      sample.ai = normalizeAiAnalysis(JSON.parse(content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1)));
      sample.usage = data.usage;
      sample.model = data.model;
      sample.analyzedAt = new Date().toISOString();
    }
    sample.current = rule;
    await writeFile(path, JSON.stringify(sample, null, 2));
    console.log(JSON.stringify({ repo:name, baseline:sample.baseline.category, kindBefore:sample.baseline.projectKindZh, current:rule.category, kindNow:rule.projectKindZh, ai:sample.ai, usage:sample.usage, keyFiles: sample.context.keyFiles.map((file: {path:string})=>file.path) }));
  } catch (error) { console.error(`${name}: ${error instanceof Error ? error.message : "Evaluation failed"}`); process.exitCode = 1; }
}
