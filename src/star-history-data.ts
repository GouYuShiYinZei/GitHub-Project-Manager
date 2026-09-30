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

const DATE_PATTERN = "[A-Z][a-z]{2} \\d{1,2}, \\d{4}";

function parseRankChange(value: string) {
  if (value === "null") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function makeRankRepo(name: string, starsTotal: string, rankChange: string, newStars?: string): StarHistoryRankRepo {
  return {
    name,
    starsTotal: Number(starsTotal),
    ...(newStars === undefined ? {} : { newStars: Number(newStars) }),
    rankChange: parseRankChange(rankChange),
  };
}

export function parseStarHistoryBundle(bundle: string): StarHistoryRankings {
  const weekly = Array.from(bundle.matchAll(/\{\s*name:"([^"]+)",\s*new_stars:(\d+),\s*stars_total:(\d+),\s*rank_change:(-?\d+|null)\s*\}/g))
    .slice(0, 20)
    .map((match) => makeRankRepo(match[1], match[3], match[4], match[2]));
  const alltime = Array.from(bundle.matchAll(/\{\s*name:"([^"]+)",\s*stars_total:(\d+),\s*rank_change:(-?\d+|null)\s*\}/g))
    .slice(0, 20)
    .map((match) => makeRankRepo(match[1], match[2], match[3]));

  const weeklyDates = bundle.match(new RegExp(`="(${DATE_PATTERN})",\\w+="(${DATE_PATTERN})",\\w+=\\[`));
  const alltimeDate = bundle.match(new RegExp(`="(${DATE_PATTERN})",\\w+=\\[\\{name:"[^"]+",\\s*stars_total:`));
  if (!weekly.length || !alltime.length) throw new Error("Star History 榜单数据格式发生变化");

  return {
    fetchedAt: new Date().toISOString(),
    source: "https://www.star-history.com/",
    weekly: { from: weeklyDates?.[1] || null, to: weeklyDates?.[2] || null, repos: weekly },
    alltime: { updatedAt: alltimeDate?.[1] || null, repos: alltime },
  };
}

function validRepo(value: unknown, withWeeklyStars: boolean): value is StarHistoryRankRepo {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.name === "string" && /^[^/\s]+\/[^/\s]+$/.test(item.name)
    && typeof item.starsTotal === "number" && Number.isFinite(item.starsTotal) && item.starsTotal >= 0
    && (!withWeeklyStars || (typeof item.newStars === "number" && Number.isFinite(item.newStars) && item.newStars >= 0))
    && (item.rankChange === null || (typeof item.rankChange === "number" && Number.isFinite(item.rankChange)));
}

export function normalizeStarHistoryRankings(value: unknown): StarHistoryRankings {
  if (!value || typeof value !== "object") throw new Error("Star History 榜单响应无效");
  const input = value as Record<string, any>;
  const weekly = input.weekly;
  const alltime = input.alltime;
  if (!weekly || !alltime || !Array.isArray(weekly.repos) || !Array.isArray(alltime.repos)) throw new Error("Star History 榜单响应缺少周榜或总榜");
  const weeklyRepos = weekly.repos.filter((item: unknown) => validRepo(item, true)).slice(0, 20);
  const alltimeRepos = alltime.repos.filter((item: unknown) => validRepo(item, false)).slice(0, 20);
  if (!weeklyRepos.length || !alltimeRepos.length) throw new Error("Star History 榜单没有可用项目");
  return {
    fetchedAt: typeof input.fetchedAt === "string" ? input.fetchedAt : new Date().toISOString(),
    source: typeof input.source === "string" ? input.source : "https://www.star-history.com/",
    weekly: { from: typeof weekly.from === "string" ? weekly.from : null, to: typeof weekly.to === "string" ? weekly.to : null, repos: weeklyRepos },
    alltime: { updatedAt: typeof alltime.updatedAt === "string" ? alltime.updatedAt : null, repos: alltimeRepos },
  };
}
