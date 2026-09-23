import type { AnalysisCategory, GitHubRepo, RepoAnalysis, RepoCodeContext } from "./types";
import type { AiConfig } from "./ai-config";
import { appFetch, isTauriRuntime } from "./transport";
import { normalizeAiAnalysis } from "./ai-validation";
import { analysisMessages } from "./ai-prompt";
import { selectReadmeEvidence } from "./readme-evidence";

const API_PREFIX = `${(import.meta.env?.BASE_URL || "/").replace(/\/$/, "")}/api`;

export type AiRepositoryAnalysis = {
  category?: AnalysisCategory;
  projectKindZh?: string;
  projectKindEn?: string;
  purposeZh?: string;
  purposeEn?: string;
  usage?: string[];
  usageEn?: string[];
  frameworkStack?: string[];
  architecture?: string[];
  evidence?: string[];
  confidence?: number;
};

function clip(value: string | null | undefined, max: number) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max)}\n...[truncated]` : value;
}

function hasCjk(value: string | undefined) {
  return Boolean(value && /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/.test(value));
}

function sanitizeStringArray(values: string[] | undefined, fallback: string[]) {
  if (!values?.length) return fallback;
  const cleaned = values.map((value) => value.trim()).filter(Boolean);
  return cleaned.length ? cleaned : fallback;
}

function sanitizeEnglishArray(values: string[] | undefined, fallback: string[]) {
  const cleaned = (values || []).map((value) => value.trim()).filter((value) => value && !hasCjk(value));
  const safeFallback = fallback.map((value) => value.trim()).filter((value) => value && !hasCjk(value));
  return cleaned.length ? cleaned : safeFallback.length ? safeFallback : ["Check the README for installation and usage details."];
}

function sanitizeEnglishText(value: string | undefined, fallback: string) {
  if (value && !hasCjk(value)) return value.trim();
  return fallback && !hasCjk(fallback) ? fallback.trim() : "No English summary is available from the repository metadata.";
}

export async function requestAiRepositoryAnalysis(
  repo: GitHubRepo,
  readme: string | null,
  context: RepoCodeContext | null,
  baseAnalysis: RepoAnalysis,
  signal?: AbortSignal,
  aiConfig?: AiConfig,
) {
  const payload = {
    repo: {
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      homepage: repo.homepage,
      language: repo.language,
      topics: repo.topics || [],
      stars: repo.stargazers_count,
    },
    readme: selectReadmeEvidence(readme),
    codeProfile: {
      languageBytes: context?.languageBytes || {},
      treeStatus: context?.treeStatus || "skipped",
      truncated: context?.truncated || false,
      files: (context?.files || []).slice(0, 220),
      directories: (context?.directories || []).slice(0, 120),
      keyFiles: (context?.keyFiles || []).map((file) => ({
        path: file.path,
        content: clip(file.content, 5000),
      })),
    },
  };

  const response = isTauriRuntime()
    ? await requestDirectAi(payload, aiConfig, signal)
    : await appFetch(`${API_PREFIX}/ai/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...payload,
      aiConfig: aiConfig
        ? {
            apiKey: aiConfig.apiKey.trim(),
            baseUrl: aiConfig.baseUrl.trim(),
          }
        : undefined,
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `AI analysis failed: ${response.status}`);
  }

  const analysis = normalizeAiAnalysis(await response.json());
  if (!analysis.purposeZh || !analysis.purposeEn) throw new Error("AI 未返回完整的中英文介绍，请重试");
  return analysis;
}

async function requestDirectAi(
  payload: Record<string, unknown>,
  aiConfig: AiConfig | undefined,
  signal?: AbortSignal,
) {
  const apiKey = aiConfig?.apiKey.trim();
  const baseUrl = aiConfig?.baseUrl.trim().replace(/\/$/, "");
  if (!apiKey || !baseUrl) throw new Error("桌面版需要先在 AI 服务设置中填写 API Key 和 Base URL");

  let model = "gpt-5.5";
  try {
    const modelsResponse = await appFetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, signal });
    if (modelsResponse.ok) {
      const models = (await modelsResponse.json()) as { data?: Array<{ id?: string }> };
      const available = (models.data || []).map((item) => item.id).filter((id): id is string => Boolean(id));
      const preferred = /qlhazycoder\.top/i.test(baseUrl)
        ? ["gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.5"]
        : ["gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.5", "deepseek-v4-pro"];
      model = preferred.find((candidate) => available.includes(candidate)) || available[0] || model;
    }
  } catch {
    // Gateways without /models still work with the conservative fallback model.
  }

  const response = await appFetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: analysisMessages(payload),
    }),
    signal,
  });
  if (!response.ok) throw new Error((await response.text()) || `AI analysis failed: ${response.status}`);
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content || "";
  const fenced = content.match(/```json\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1] : content;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("模型未返回 JSON");
  return new Response(source.slice(start, end + 1), { status: 200, headers: { "Content-Type": "application/json" } });
}

export function applyAiAnalysis(base: RepoAnalysis, input: AiRepositoryAnalysis): RepoAnalysis {
  const ai = normalizeAiAnalysis(input);
  const projectKindEn = sanitizeEnglishText(ai.projectKindEn, base.projectKindEn || "open-source project");
  const purposeEn = sanitizeEnglishText(ai.purposeEn, base.purposeEn);

  return {
    ...base,
    category: ai.category || base.category,
    projectKindZh: ai.projectKindZh || base.projectKindZh,
    projectKindEn,
    purpose: ai.purposeZh || base.purposeZh,
    purposeZh: ai.purposeZh || base.purposeZh,
    purposeEn,
    usage: sanitizeStringArray(ai.usage, base.usage),
    usageEn: sanitizeEnglishArray(ai.usageEn, base.usageEn),
    frameworkStack: sanitizeStringArray(ai.frameworkStack, base.frameworkStack),
    architecture: sanitizeStringArray(ai.architecture, base.architecture),
    evidence: sanitizeStringArray(ai.evidence, base.evidence),
    confidence: ai.confidence ?? base.confidence,
    analysisEngine: "ai",
  };
}
