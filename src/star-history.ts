import { appFetch, isTauriRuntime } from "./transport";
import { normalizeStarHistoryRankings, parseStarHistoryBundle, type StarHistoryRankRepo, type StarHistoryRankings } from "./star-history-data";

const API_PREFIX = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
export type { StarHistoryRankRepo, StarHistoryRankings } from "./star-history-data";

export async function fetchStarHistoryRankings(refresh = false, signal?: AbortSignal) {
  const response = isTauriRuntime()
    ? await fetchDirectStarHistory(signal)
    : await appFetch(`${API_PREFIX}/star-history/rankings${refresh ? "?refresh=1" : ""}`, { signal });
  if (!response.ok) {
    let message = "无法读取 Star History 榜单";
    try {
      const body = (await response.json()) as { error?: string };
      message = body.error || message;
    } catch {
      // Keep the friendly fallback when the proxy does not return JSON.
    }
    throw new Error(message);
  }

  return normalizeStarHistoryRankings(await response.json());
}

async function fetchDirectStarHistory(signal?: AbortSignal) {
  const homepage = await appFetch("https://www.star-history.com/", { headers: { "User-Agent": "GitHub-Star-Manager/1.0" }, signal });
  if (!homepage.ok) throw new Error(`Star History 首页返回 ${homepage.status}`);
  const html = await homepage.text();
  const assetPath = html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
  if (!assetPath) throw new Error("没有找到 Star History 榜单资源");
  const asset = await appFetch(new URL(assetPath, "https://www.star-history.com"), { headers: { "User-Agent": "GitHub-Star-Manager/1.0" }, signal });
  if (!asset.ok) throw new Error(`Star History 榜单资源返回 ${asset.status}`);
  return new Response(JSON.stringify(parseStarHistoryBundle(await asset.text())), { status: 200, headers: { "Content-Type": "application/json" } });
}
