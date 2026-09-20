import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 900_000) {
        reject(new Error("请求内容过大"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, value: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(value));
}

function extractJson(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1] : text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("模型未返回 JSON");
  return JSON.parse(source.slice(start, end + 1));
}

type RequestAiConfig = {
  apiKey?: string;
  baseUrl?: string;
};

const requestModelCache = new Map<string, string>();

async function resolveRequestModel(requestBaseUrl: string, requestApiKey: string, fallbackModel: string) {
  if (/agentrouter\.org/i.test(requestBaseUrl)) return "gpt-5.5";

  const cacheKey = requestBaseUrl.replace(/\/$/, "");
  const cachedModel = requestModelCache.get(cacheKey);
  if (cachedModel) return cachedModel;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${cacheKey}/models`, {
      headers: { Authorization: `Bearer ${requestApiKey}` },
      signal: controller.signal,
    });
    if (response.ok) {
      const data = (await response.json()) as { data?: Array<{ id?: string }> };
      const availableModels = (data.data || []).map((item) => item.id).filter((id): id is string => Boolean(id));
      const preferredModels = /qlhazycoder\.top/i.test(cacheKey)
        ? ["gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.5", fallbackModel]
        : [fallbackModel, "gpt-5.5", "gpt-5.5-openai-compact", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];
      const preferredModel = preferredModels.find((candidate) => availableModels.includes(candidate));
      const resolvedModel = preferredModel || availableModels[0];
      if (resolvedModel) {
        requestModelCache.set(cacheKey, resolvedModel);
        return resolvedModel;
      }
    }
  } catch {
    // Some compatible gateways do not expose /models; keep the configured fallback.
  } finally {
    clearTimeout(timeout);
  }

  return fallbackModel;
}

function aiAnalyzePlugin(apiKey: string, baseUrl: string, model: string): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    try {
      const payload = JSON.parse(await readBody(req)) as { aiConfig?: RequestAiConfig; [key: string]: unknown };
      const requestConfig = payload.aiConfig || {};
      const requestApiKey = requestConfig.apiKey?.trim() || apiKey;
      const configuredBaseUrl = requestConfig.baseUrl?.trim() || baseUrl;
      const requestBaseUrl = configuredBaseUrl.replace(/^https?:\/\/agentrouter\.org(?=\/|$)/i, "https://co.agentrouter.org");

      if (!requestApiKey) {
        sendJson(res, 500, { error: "AI API Key 未配置，请在页面 AI 服务设置中填写，或配置 .env.local" });
        return;
      }

      const requestModel = await resolveRequestModel(requestBaseUrl, requestApiKey, model);
      delete payload.aiConfig;
      const response = await fetch(`${requestBaseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${requestApiKey}`,
        },
        body: JSON.stringify({
          model: requestModel,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                [
                  "你是一个资深开源项目产品分析师，目标用户是想快速理解自己 star 列表的普通开发者。",
                  "只输出 JSON，不要输出 Markdown。",
                  "分析优先级：1) README 的标题、首段、Features/Usage/Examples；2) repo description/topics；3) 代码结构、语言、关键配置文件。代码结构只作为证据，不要喧宾夺主。",
                  "中文字段必须是自然中文总结，不能照搬英文 README；专有名词、库名、模型名、产品名可以保留英文。",
                  "英文字段必须只使用英文，不允许出现中文字符、中文分类名或中文结构词。",
                  "介绍要贴切、完整、简单易懂：说清楚它具体做什么、解决什么问题、适合谁/什么场景、为什么这样判断。",
                  "不要把 documentation/docs/README 当成 PDF/文档处理工具；只有明确 PDF、OCR、Office 文件、文件转换/合并/拆分/压缩时才归为 productivity。",
                  "如果 README 是 awesome/list/ranking/collection，要识别为资料清单，而不是应用程序。",
                  "usage 要提炼真实上手方式；如果 README 没有明确命令，可以写“查看 README/Release/示例目录”，不要编造具体命令。",
                ].join("\n"),
            },
            {
              role: "user",
              content: `请分析这个 GitHub starred 仓库，返回严格 JSON：\n{\n  "category": "ai|frontend|backend|devtools|data|infra|mobile|docs|testing|media|productivity|general",\n  "projectKindZh": "中文项目形态，8-22字",\n  "projectKindEn": "English-only project kind, 3-8 words",\n  "purposeZh": "中文，90-180字。不要逐字翻译 README，要总结：它是什么、做什么、适合什么场景、主要依据。除专有名词外不要夹英文长句。",\n  "purposeEn": "English only, 45-90 words. No Chinese characters.",\n  "usage": ["中文使用方式，2-5条。命令可保留原样。不要编造不存在的命令。"],\n  "usageEn": ["English-only usage notes, 2-5 items. No Chinese characters."],\n  "frameworkStack": ["关键框架/语言/平台，最多6项"],\n  "architecture": ["中文代码结构摘要，最多4项，每项不超过40字"],\n  "evidence": ["中文判断依据，最多4项，每项不超过45字"],\n  "confidence": 0-98\n}\n\n仓库资料：\n${JSON.stringify(payload, null, 2)}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        sendJson(res, response.status, { error: text || response.statusText });
        return;
      }

      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content || "";
      sendJson(res, 200, extractJson(content));
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : "AI 分析失败" });
    }
  };

  return {
    name: "github-star-manager-ai",
    configureServer(server) {
      server.middlewares.use("/api/ai/analyze", handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/ai/analyze", handler);
    },
  };
}

type StarHistoryRankRepoResponse = {
  name: string;
  starsTotal: number;
  newStars?: number;
  rankChange: number | null;
};

type StarHistoryRankingsResponse = {
  fetchedAt: string;
  source: string;
  weekly: {
    from: string | null;
    to: string | null;
    repos: StarHistoryRankRepoResponse[];
  };
  alltime: {
    updatedAt: string | null;
    repos: StarHistoryRankRepoResponse[];
  };
};

function parseRankChange(value: string) {
  return value === "null" ? null : Number(value);
}

function parseStarHistoryBundle(bundle: string): StarHistoryRankingsResponse {
  const weeklyRepos = Array.from(
    bundle.matchAll(/\{name:"([^"]+)",new_stars:(\d+),stars_total:(\d+),rank_change:(-?\d+|null)\}/g),
  )
    .slice(0, 20)
    .map((match) => ({
      name: match[1],
      newStars: Number(match[2]),
      starsTotal: Number(match[3]),
      rankChange: parseRankChange(match[4]),
    }));
  const alltimeRepos = Array.from(
    bundle.matchAll(/\{name:"([^"]+)",stars_total:(\d+),rank_change:(-?\d+|null)\}/g),
  )
    .slice(0, 20)
    .map((match) => ({
      name: match[1],
      starsTotal: Number(match[2]),
      rankChange: parseRankChange(match[3]),
    }));

  const datePattern = "[A-Z][a-z]{2} \\d{1,2}, \\d{4}";
  const weeklyDates = bundle.match(new RegExp(`="(${datePattern})",\\w+="(${datePattern})",\\w+=\\[`));
  const alltimeDate = bundle.match(new RegExp(`="(${datePattern})",\\w+=\\[\\{name:"[^"]+",stars_total:`));

  if (!weeklyRepos.length || !alltimeRepos.length) {
    throw new Error("Star History 榜单数据格式发生变化");
  }

  return {
    fetchedAt: new Date().toISOString(),
    source: "https://www.star-history.com/",
    weekly: {
      from: weeklyDates?.[1] || null,
      to: weeklyDates?.[2] || null,
      repos: weeklyRepos,
    },
    alltime: {
      updatedAt: alltimeDate?.[1] || null,
      repos: alltimeRepos,
    },
  };
}

function starHistoryPlugin(): Plugin {
  let cache: { expiresAt: number; data: StarHistoryRankingsResponse } | null = null;

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    try {
      const requestUrl = new URL(req.url || "/", "http://localhost");
      const forceRefresh = requestUrl.searchParams.has("refresh");
      if (!forceRefresh && cache && cache.expiresAt > Date.now()) {
        sendJson(res, 200, cache.data);
        return;
      }

      const homepage = await fetch("https://www.star-history.com/", {
        headers: { "User-Agent": "GitHub-Star-Manager/1.0" },
      });
      if (!homepage.ok) throw new Error(`Star History 首页返回 ${homepage.status}`);
      const html = await homepage.text();
      const assetPath = html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
      if (!assetPath) throw new Error("没有找到 Star History 榜单资源");

      const asset = await fetch(new URL(assetPath, "https://www.star-history.com"), {
        headers: { "User-Agent": "GitHub-Star-Manager/1.0" },
      });
      if (!asset.ok) throw new Error(`Star History 榜单资源返回 ${asset.status}`);
      const data = parseStarHistoryBundle(await asset.text());
      cache = { expiresAt: Date.now() + 10 * 60 * 1000, data };
      sendJson(res, 200, data);
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : "无法读取 Star History 榜单" });
    }
  };

  return {
    name: "github-star-manager-star-history",
    configureServer(server) {
      server.middlewares.use("/api/star-history/rankings", handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/star-history/rankings", handler);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      react(),
      starHistoryPlugin(),
      aiAnalyzePlugin(
        env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || "",
        env.DEEPSEEK_BASE_URL || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
        env.DEEPSEEK_MODEL || process.env.DEEPSEEK_MODEL || "deepseek-v4-pro",
      ),
    ],
  };
});
