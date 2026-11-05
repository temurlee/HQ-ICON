import assert from "node:assert/strict";
import test from "node:test";
import {
  getScreenshotGroups,
  lookupApp,
  parseAppStoreInput,
  searchApp,
} from "../src/searchApp.js";

test("parses App Store links and IDs without changing ordinary searches", () => {
  assert.deepEqual(
    parseAppStoreInput("https://apps.apple.com/sg/app/siri/id6758482875?uo=4"),
    { id: "6758482875", country: "sg" },
  );
  assert.deepEqual(parseAppStoreInput("id6758482875"), {
    id: "6758482875",
    country: null,
  });
  assert.deepEqual(parseAppStoreInput("6758482875"), {
    id: "6758482875",
    country: null,
  });
  assert.equal(parseAppStoreInput("Siri"), null);
  assert.equal(parseAppStoreInput("https://example.com/app/id6758482875"), null);
});

test("looks up a specific app and ignores non-app results", async (t) => {
  let requestedUrl;
  t.mock.method(globalThis, "fetch", async (url) => {
    requestedUrl = new URL(url);
    return {
      ok: true,
      json: async () => ({
        resultCount: 2,
        results: [
          { trackId: 6758482875, kind: "software", artworkUrl512: "icon" },
          { trackId: 123, kind: "song", artworkUrl512: "cover" },
        ],
      }),
    };
  });

  const data = await lookupApp("6758482875", "sg");
  assert.equal(requestedUrl.pathname, "/lookup");
  assert.equal(requestedUrl.searchParams.get("id"), "6758482875");
  assert.equal(requestedUrl.searchParams.get("country"), "sg");
  assert.equal(data.resultCount, 1);
  assert.equal(data.results[0].trackId, 6758482875);
});

test("encodes search terms as query parameters", async (t) => {
  let requestedUrl;
  t.mock.method(globalThis, "fetch", async (url) => {
    requestedUrl = new URL(url);
    return { ok: true, json: async () => ({ resultCount: 0, results: [] }) };
  });

  await searchApp("Siri & Maps", "sg", "software", "18");
  assert.equal(requestedUrl.pathname, "/search");
  assert.equal(requestedUrl.searchParams.get("term"), "Siri & Maps");
  assert.equal(requestedUrl.searchParams.get("country"), "sg");
});

test("groups iPhone and iPad screenshots in platform order", () => {
  const groups = getScreenshotGroups({
    screenshotUrls: ["https://example.com/phone/1290x2796bb.jpg"],
    ipadScreenshotUrls: ["https://example.com/ipad/2732x2048bb.jpg"],
  });

  assert.deepEqual(
    groups.map((group) => group.platform),
    ["iPhone", "iPad"],
  );
  assert.equal(
    groups[0].screenshots[0].downloadUrl,
    "https://example.com/phone/4096x4096bb.jpg",
  );
  assert.equal(
    groups[1].screenshots[0].downloadUrl,
    "https://example.com/ipad/4096x4096bb.jpg",
  );
});

test("ignores missing screenshot fields and empty arrays", () => {
  assert.deepEqual(getScreenshotGroups({}), []);
  assert.deepEqual(
    getScreenshotGroups({
      screenshotUrls: [],
      ipadScreenshotUrls: undefined,
      appletvScreenshotUrls: ["https://example.com/tv/1920x1080bb.png"],
    }).map((group) => group.platform),
    ["Apple TV"],
  );
});

test("rewrites jpg and png screenshot URLs to full-size images", () => {
  const [group] = getScreenshotGroups({
    screenshotUrls: [
      "https://example.com/a/392x696bb.jpg",
      "https://example.com/b/392x696bb.png",
    ],
  });

  assert.deepEqual(
    group.screenshots.map((screenshot) => screenshot.downloadUrl),
    [
      "https://example.com/a/4096x4096bb.jpg",
      "https://example.com/b/4096x4096bb.png",
    ],
  );
});

test("keeps non-standard screenshot URLs unchanged", () => {
  const urls = [
    "https://example.com/image.jpg",
    "https://example.com/392x696bb.jpg?x=1",
  ];
  const [group] = getScreenshotGroups({ screenshotUrls: urls });

  assert.deepEqual(
    group.screenshots.map((screenshot) => screenshot.downloadUrl),
    urls,
  );
});
