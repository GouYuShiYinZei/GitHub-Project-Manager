export type StarHistoryRankRepo = {
  name: string;
  starsTotal: number;
  newStars?: number;
  rankChange: number | null;
};

export type StarHistoryRankings = {
  fetchedAt: string;
  source: string;
  weekly: {
    from: string | null;
    to: string | null;
    repos: StarHistoryRankRepo[];
  };
  alltime: {
    updatedAt: string | null;
    repos: StarHistoryRankRepo[];
  };
};

export async function fetchStarHistoryRankings(refresh = false, signal?: AbortSignal) {
  const response = isTauriRuntime()
    ? await fetchDirectStarHistory(signal)
    : await appFetch(`/api/star-history/rankings${refresh ? "?refresh=1" : ""}`, { signal });
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

  return (await response.json()) as StarHistoryRankings;
}

function parseRankChange(value: string) {
  return value === "null" ? null : Number(value);
}

function parseDirectBundle(bundle: string): StarHistoryRankings {
  const weekly = Array.from(bundle.matchAll(/\{name:"([^"]+)",new_stars:(\d+),stars_total:(\d+),rank_change:(-?\d+|null)\}/g))
    .slice(0, 20)
    .map((match) => ({ name: match[1], newStars: Number(match[2]), starsTotal: Number(match[3]), rankChange: parseRankChange(match[4]) }));
  const alltime = Array.from(bundle.matchAll(/\{name:"([^"]+)",stars_total:(\d+),rank_change:(-?\d+|null)\}/g))
    .slice(0, 20)
    .map((match) => ({ name: match[1], starsTotal: Number(match[2]), rankChange: parseRankChange(match[3]) }));
  const datePattern = "[A-Z][a-z]{2} \\d{1,2}, \\d{4}";
  const weeklyDates = bundle.match(new RegExp(`="(${datePattern})",\\w+="(${datePattern})",\\w+=\\[`));
  const alltimeDate = bundle.match(new RegExp(`="(${datePattern})",\\w+=\\[\\{name:"[^"]+",stars_total:`));
  if (!weekly.length || !alltime.length) throw new Error("Star History 榜单数据格式发生变化");
  return {
    fetchedAt: new Date().toISOString(),
    source: "https://www.star-history.com/",
    weekly: { from: weeklyDates?.[1] || null, to: weeklyDates?.[2] || null, repos: weekly },
    alltime: { updatedAt: alltimeDate?.[1] || null, repos: alltime },
  };
}

async function fetchDirectStarHistory(signal?: AbortSignal) {
  const homepage = await appFetch("https://www.star-history.com/", { headers: { "User-Agent": "GitHub-Star-Manager/1.0" }, signal });
  if (!homepage.ok) throw new Error(`Star History 首页返回 ${homepage.status}`);
  const html = await homepage.text();
  const assetPath = html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
  if (!assetPath) throw new Error("没有找到 Star History 榜单资源");
  const asset = await appFetch(new URL(assetPath, "https://www.star-history.com"), { headers: { "User-Agent": "GitHub-Star-Manager/1.0" }, signal });
  if (!asset.ok) throw new Error(`Star History 榜单资源返回 ${asset.status}`);
  return new Response(JSON.stringify(parseDirectBundle(await asset.text())), { status: 200, headers: { "Content-Type": "application/json" } });
}
import { appFetch, isTauriRuntime } from "./transport";
