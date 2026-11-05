# App Store Data Reference

This reference explains what the CLI reads, how the image URLs are built, and where the data is unreliable. It is intentionally narrower than Apple's public documentation.

## Endpoints

| Purpose | Endpoint | Auth |
| --- | --- | --- |
| Search | https://itunes.apple.com/search | None |
| Lookup | https://itunes.apple.com/lookup | None |
| Product page | https://apps.apple.com/{country}/app/id{id} | None |
| Image CDN | https://is1-ssl.mzstatic.com/image/thumb/... | None |

The iTunes endpoints return JSON. The product page returns HTML with a JSON payload in a script tag with the id **serialized-server-data**.

## Inputs

The CLI accepts a search term, an App Store URL, or a numeric ID. For a URL, the country in the path wins over **--country**.

    https://apps.apple.com/cn/app/id989673964
    id989673964
    989673964

Ordinary text is sent to the iTunes search endpoint. Only apps with **artworkUrl512** and kind **software** or **mac-software** are kept.

## Metadata fields

The manifest copies these iTunes fields:

- **trackId**, **trackName**, **artistName**, **kind**
- **primaryGenreName**, **bundleId**, **version**
- **trackViewUrl**, **artworkUrl512**

Screenshot fields:

- **screenshotUrls**: primary device screenshots; labeled macOS for mac-software
- **ipadScreenshotUrls**: iPad screenshots
- **appletvScreenshotUrls**: Apple TV screenshots

## Icon URLs

Start from **artworkUrl512**, for example:

    https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/.../icon.png/512x512bb.jpg

Remove the final /512x512bb.ext segment, then append one of these variants:

    /{size}x{size}ia-100.{format}   official, pre-rounded
    /{size}x{size}bb-100.{format}   raw, square

Verified sizes are 256, 512, and 1024. Verified formats are png, jpg, and webp. Requesting a larger size than the source returns the source resolution rather than failing. The **-100** suffix is required for this icon variant.

HQ-ICON's "normal rounded" mode is a canvas mask applied to the raw image. The mask path lives in https://github.com/temurlee/HQ-ICON/blob/main/src/drawOutline.jsx if a consumer needs the exact shape.

## Screenshot URLs

The API returns thumbnail URLs ending in a size such as:

    .../1290x2796bb.jpg

Replacing the final size with **/4096x4096bb** requests the source image. In practice this returns the source resolution, for example 1290x2796 for an iPhone screenshot and 2732x2048 for a landscape iPad screenshot. The extension is preserved.

The CLI returns both **previewUrl** and **downloadUrl** for every screenshot. It preserves the platform order iPhone, iPad, Apple TV and omits empty groups.

## Featured materials

The product page payload lives under:

    data[0].data

The hero image is:

    data[0].data.uber.artwork

Related topics are:

    data[0].data.shelfMapping.featuredIn.items

Each topic can provide **title**, **heading**, a **clickAction.pageUrl** story link, and a first artwork in **media.artworks[0]**.

Artwork nodes use a URL template with placeholders:

    /{w}x{h}{c}.{f}

The CLI replaces the placeholders:

- Preview: 1200 pixels wide for the hero, 400 pixels wide for a topic card
- Download: at least 1600 pixels wide, preserving the template's aspect ratio
- Crop: **bb**, unless the template already contains a literal crop such as **sr**
- Format: **jpg**

Some templates are literal, for example a Procreate hero ending in **1200x300sr.jpg**. In that case the crop placeholder is absent and the CLI keeps the template's intended crop.

Observed examples:

- 王者荣耀 (989673964, cn): hero 5244x2950; no related topics
- Procreate (425073498, cn): hero 4320x1080; three related topics with 800x490 card artwork

The iTunes API does not expose the hero or the featured topics. They only exist in the product page payload.

## CORS and proxying

The image CDN sends:

    Access-Control-Allow-Origin: *

The product page does not. A browser request carrying an Origin header receives HTTP 403, so a static browser app cannot read the page directly. A skill or agent with shell access can fetch it server-side. A browser integration needs a same-origin proxy or a serverless function that fetches the page and returns the extracted JSON. Never proxy arbitrary user-supplied URLs from a shared server; validate the app ID and country and build the Apple URL yourself.

The amp-api-edge endpoints return 401 without Apple's application token and are not a replacement for this page parse.

## Manifest shape

The CLI prints a manifest shaped like this:

    {
      "query": "425073498",
      "country": "cn",
      "results": [
        {
          "trackId": 425073498,
          "trackName": "Procreate",
          "artistName": "Savage Interactive Pty Ltd",
          "icon": {
            "official": {"url": "...", "width": 1024, "height": 1024, "format": "png"},
            "raw": {"url": "...", "width": 1024, "height": 1024, "format": "png"}
          },
          "screenshots": [
            {"platform": "iPad", "screenshots": [{"previewUrl": "...", "downloadUrl": "..."}]}
          ],
          "featured": {
            "hero": {"previewUrl": "...", "downloadUrl": "...", "width": 4320, "height": 1080},
            "topics": [
              {"title": "...", "heading": "...", "url": "...", "previewUrl": "...", "downloadUrl": "...", "width": 800, "height": 490}
            ]
          }
        }
      ]
    }

With **--download**, each result also has a **downloads** object with **icon**, **screenshots**, and **featured** arrays of saved file paths.

## Troubleshooting

- **HTTP 403 from apps.apple.com**: the request included an Origin header, or Apple is rate limiting. Fetch server-side without an Origin header and retry later.
- **No serialized-server-data**: the page layout changed or Apple served a block page. Inspect the HTML before changing the parser.
- **Empty featured object**: the app is not currently in a related editorial topic or has no hero. This is valid.
- **Missing screenshots**: the app has no images for that device family. Empty groups are omitted.
- **Large batch requests**: each app with featured parsing costs one product-page request. Use **--limit** and **--no-featured** while resolving names, then fetch the chosen app.
