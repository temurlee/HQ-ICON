const CACHE_TTL_MS = 30 * 60 * 1000;
const responseCache = new Map();

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

export function artworkUrl(artwork, width, height, crop = "bb", format = "jpg") {
  if (!artwork?.template || !width || !height) return null;
  return artwork.template
    .replace("{w}", String(width))
    .replace("{h}", String(height))
    .replace("{c}", crop)
    .replace("{f}", format);
}

function buildAssets(artwork, previewWidth) {
  if (!artwork?.template) return null;

  const sourceWidth = Number(artwork.width) || previewWidth;
  const sourceHeight =
    Number(artwork.height) || Math.round(previewWidth * 0.5625);
  const ratio = sourceHeight / sourceWidth;
  const previewHeight = Math.max(1, Math.round(previewWidth * ratio));
  const downloadWidth = Math.max(sourceWidth, 1600);
  const downloadHeight = Math.max(1, Math.round(downloadWidth * ratio));

  return {
    previewUrl: artworkUrl(artwork, previewWidth, previewHeight),
    downloadUrl: artworkUrl(artwork, downloadWidth, downloadHeight),
    width: sourceWidth,
    height: sourceHeight,
  };
}

function emptyMaterials() {
  return { hero: null, topics: [] };
}

export function extractMaterials(html) {
  if (typeof html !== "string") return emptyMaterials();

  const match = html.match(
    /<script[^>]*id=["']serialized-server-data["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!match) return emptyMaterials();

  let parsed;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return emptyMaterials();
  }

  const page = parsed?.data?.[0]?.data;
  if (!page) return emptyMaterials();

  const hero = buildAssets(page.uber?.artwork, 1200);
  const items = page.shelfMapping?.featuredIn?.items;
  const topics = [];

  if (Array.isArray(items)) {
    const seen = new Set();
    for (const item of items) {
      const url = item?.clickAction?.pageUrl;
      const artwork = item?.media?.artworks?.[0];
      if (!url || !artwork || seen.has(url)) continue;

      const assets = buildAssets(artwork, 400);
      if (!assets) continue;

      seen.add(url);
      topics.push({
        title: item.title || "",
        heading: item.heading || "",
        url,
        ...assets,
      });
      if (topics.length >= 6) break;
    }
  }

  return { hero, topics };
}

export async function fetchAppStoreMaterials(id, country) {
  const key = `${country}:${id}`;
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const pageUrl =
    `https://apps.apple.com/${encodeURIComponent(country)}/app/id` +
    encodeURIComponent(id);
  const res = await fetch(pageUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language":
        country === "cn" ? "zh-CN,zh;q=0.9" : "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = extractMaterials(await res.text());
  responseCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

function sendJson(res, status, body, cacheControl) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (cacheControl) res.setHeader("Cache-Control", cacheControl);
  res.end(JSON.stringify(body));
}

export async function handleMaterialsRequest(req, res) {
  const requestUrl = new URL(req.url || "/", "http://localhost");
  if (!requestUrl.pathname.endsWith("/api/appstore-materials")) return false;

  const id = requestUrl.searchParams.get("id") || "";
  const country = (
    requestUrl.searchParams.get("country") || "us"
  ).toLowerCase();
  if (!/^\d{6,}$/.test(id) || !/^[a-z]{2}$/.test(country)) {
    sendJson(res, 400, { error: "Invalid id or country" });
    return true;
  }

  try {
    const data = await fetchAppStoreMaterials(id, country);
    sendJson(res, 200, data, "public, max-age=1800");
  } catch (error) {
    console.error("App Store materials fetch failed:", error);
    sendJson(res, 502, { error: "App Store page unavailable" });
  }
  return true;
}

export function materialsMiddleware(req, res, next) {
  handleMaterialsRequest(req, res)
    .then((handled) => {
      if (!handled) next();
    })
    .catch(next);
}
