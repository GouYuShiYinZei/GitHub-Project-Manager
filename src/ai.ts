import type { AnalysisCategory, GitHubRepo, RepoAnalysis, RepoCodeContext } from "./types";
import type { AiConfig } from "./ai-config";
import { appFetch, isTauriRuntime } from "./transport";

const API_PREFIX = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

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
    readme: clip(readme, 12000),
    codeProfile: {
      languageBytes: context?.languageBytes || {},
      files: (context?.files || []).slice(0, 220),
      directories: (context?.directories || []).slice(0, 120),
      keyFiles: (context?.keyFiles || []).map((file) => ({
        path: file.path,
        content: clip(file.content, 5000),
      })),
    },
    ruleAnalysis: {
      category: baseAnalysis.category,
      projectKindZh: baseAnalysis.projectKindZh,
      purposeZh: baseAnalysis.purposeZh,
      frameworkStack: baseAnalysis.frameworkStack,
      architecture: baseAnalysis.architecture,
      evidence: baseAnalysis.evidence,
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

  return (await response.json()) as AiRepositoryAnalysis;
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
      messages: [
        {
          role: "system",
          content: [
            "你是一个资深开源项目产品分析师，目标用户是想快速理解自己 star 列表的普通开发者。",
            "只输出 JSON，不要输出 Markdown。",
            "分析优先级：README 的标题、首段、Features/Usage/Examples；然后看 repo description/topics；最后用代码结构、语言和关键配置文件核对结论。代码结构是证据，不要喧宾夺主。",
            "中文字段必须是自然中文总结，不能照搬英文 README；专有名词、库名、模型名、产品名可以保留英文。英文字段只能使用英文，不允许出现中文字符。",
            "说清楚它具体做什么、解决什么问题、适合谁/什么场景。不要把 documentation/docs/README 当成 PDF/文档处理工具；只有明确处理 PDF、OCR、Office 文件或文件转换时才归为效率工具。awesome/list/ranking/collection 应识别为资料清单。",
            "usage 只提炼真实上手方式；没有明确命令时写查看 README、Release 或示例目录，不要编造命令。",
          ].join("\n"),
        },
        {
          role: "user",
          content: `请分析这个 GitHub starred 仓库，返回严格 JSON。字段要求：category、projectKindZh、projectKindEn、purposeZh、purposeEn、usage、usageEn、frameworkStack、architecture、evidence、confidence。purposeZh 90-180字，purposeEn 45-90 words；usage 和 usageEn 各2-5条；英文字段不能有中文。仓库资料：${JSON.stringify(payload, null, 2)}`,
        },
      ],
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

export function applyAiAnalysis(base: RepoAnalysis, ai: AiRepositoryAnalysis): RepoAnalysis {
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
    confidence: Math.max(base.confidence, ai.confidence || 0),
    analysisEngine: "ai",
  };
}
