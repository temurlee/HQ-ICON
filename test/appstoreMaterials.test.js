import assert from "node:assert/strict";
import test from "node:test";
import {
  artworkUrl,
  extractMaterials,
} from "../server/appstoreMaterials.js";

const artwork = (template, width, height) => ({
  $kind: "Artwork",
  template,
  width,
  height,
});

const pageHtml = (page) =>
  `<html><script id="serialized-server-data" type="application/json">${JSON.stringify(
    { data: [{ data: page }] },
  )}</script></html>`;

test("builds mzstatic artwork URLs from a template", () => {
  const source = artwork("https://example.com/{w}x{h}{c}.{f}", 100, 50);
  assert.equal(
    artworkUrl(source, 400, 200),
    "https://example.com/400x200bb.jpg",
  );
  assert.equal(
    artworkUrl(source, 800, 400, "sr", "png"),
    "https://example.com/800x400sr.png",
  );
  assert.equal(artworkUrl({}, 100, 100), null);
});

test("extracts the hero artwork and related topics", () => {
  const storyUrl = "https://apps.apple.com/cn/ipad/story/id1470039123";
  const materials = extractMaterials(
    pageHtml({
      uber: {
        artwork: artwork("https://example.com/hero/{w}x{h}{c}.{f}", 5244, 2950),
      },
      shelfMapping: {
        featuredIn: {
          items: [
            {
              title: "用画笔定格一座城",
              heading: "对话创作者",
              media: {
                artworks: [
                  artwork(
                    "https://example.com/topic/{w}x{h}{c}.{f}",
                    800,
                    490,
                  ),
                ],
              },
              clickAction: { pageUrl: storyUrl },
            },
            {
              title: "重复专题",
              media: {
                artworks: [
                  artwork(
                    "https://example.com/topic/{w}x{h}{c}.{f}",
                    800,
                    490,
                  ),
                ],
              },
              clickAction: { pageUrl: storyUrl },
            },
          ],
        },
      },
    }),
  );

  assert.equal(
    materials.hero.previewUrl,
    "https://example.com/hero/1200x675bb.jpg",
  );
  assert.equal(
    materials.hero.downloadUrl,
    "https://example.com/hero/5244x2950bb.jpg",
  );
  assert.equal(materials.topics.length, 1);
  assert.deepEqual(materials.topics[0], {
    title: "用画笔定格一座城",
    heading: "对话创作者",
    url: storyUrl,
    previewUrl: "https://example.com/topic/400x245bb.jpg",
    downloadUrl: "https://example.com/topic/1600x980bb.jpg",
    width: 800,
    height: 490,
  });
});

test("returns empty materials for missing or invalid page data", () => {
  assert.deepEqual(extractMaterials("<html></html>"), {
    hero: null,
    topics: [],
  });
  assert.deepEqual(
    extractMaterials(
      "<script id='serialized-server-data'>not json</script>",
    ),
    { hero: null, topics: [] },
  );
  assert.deepEqual(
    extractMaterials(pageHtml({ shelfMapping: { featuredIn: null } })),
    { hero: null, topics: [] },
  );
});
