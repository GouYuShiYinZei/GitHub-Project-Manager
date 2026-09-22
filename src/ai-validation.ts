import type { AiRepositoryAnalysis } from "./ai";
import type { AnalysisCategory } from "./types";

const categories = new Set<AnalysisCategory>(["ai", "frontend", "backend", "devtools", "data", "infra", "mobile", "docs", "testing", "media", "productivity", "general"]);

export function normalizeAiAnalysis(value: unknown): AiRepositoryAnalysis {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("AI 返回内容不是有效的项目分析");
  const input = value as Record<string, unknown>;
  const result: AiRepositoryAnalysis = {};
  for (const field of ["projectKindZh", "projectKindEn", "purposeZh", "purposeEn"] as const) {
    if (typeof input[field] === "string" && input[field].trim()) result[field] = input[field].trim().slice(0, 6000);
  }
  for (const field of ["usage", "usageEn", "frameworkStack", "architecture", "evidence"] as const) {
    if (Array.isArray(input[field])) result[field] = input[field].filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, 12).map((item) => item.trim().slice(0, 2000));
  }
  if (typeof input.category === "string" && categories.has(input.category as AnalysisCategory)) result.category = input.category as AnalysisCategory;
  if (typeof input.confidence === "number" && Number.isFinite(input.confidence)) result.confidence = Math.max(0, Math.min(98, Math.round(input.confidence)));
  return result;
}
