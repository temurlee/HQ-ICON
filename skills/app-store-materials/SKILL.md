---
name: app-store-materials
description: Fetch App Store app icons, device screenshots, hero artwork, and related editorial topics from an app name, App Store link, or numeric ID. Use for App Store marketing assets and app metadata; not for Apple Music, books, or arbitrary web images.
---

# App Store Materials

Use **scripts/appstore_materials.py** to resolve an app and return a JSON manifest of official assets. The script uses only Python's standard library, so any agent with Python 3 and network access can run it.

## Quick start

Run these commands from this skill's folder.

    python3 scripts/appstore_materials.py "Siri" --country us --limit 5 --no-featured
    python3 scripts/appstore_materials.py "https://apps.apple.com/cn/app/id989673964" --country cn
    python3 scripts/appstore_materials.py 425073498 --country cn --download ./materials

The manifest includes **icon.official**, **icon.raw**, **screenshots** grouped by iPhone, iPad, Apple TV, or macOS, and **featured** with the product hero and related topics when available.

## Workflow

1. If the user gave only a name, search with **--limit 5 --no-featured** and inspect **trackName**, **artistName**, and **trackId**. If several apps match, ask which one or use the unambiguous match.
2. For the chosen app, rerun with its **trackId** or App Store URL so the result is exact and featured materials are included.
3. Add **--download DIR** to save assets. Use **--types icon,screenshots,featured** to limit downloads, **--cut official|raw|both** for the icon variant, and **--size** / **--format** for icon output.
4. Report the resolved app and the downloaded file paths. Download only what the user requested.

## Asset details

- **Icon**: iTunes **artworkUrl512** is the source. The **official** variant uses the pre-rounded **ia** image; **raw** uses **bb**. Supported icon sizes are 256, 512, and 1024 pixels; supported formats are png, jpg, and webp. HQ-ICON's "normal rounded" style is the raw icon masked in a canvas; apply that mask in the consuming app if needed.
- **Screenshots**: **screenshotUrls**, **ipadScreenshotUrls**, and **appletvScreenshotUrls**. The download URL replaces the final /WxHbb.ext with /4096x4096bb.ext to request the source image. The preview URL stays at the API thumbnail size. For mac-software results, the primary screenshot field is labeled macOS.
- **Featured**: **uber.artwork** is the product hero; **shelfMapping.featuredIn** contains related topic cards. Availability varies. A missing hero or empty topic list is a normal result, not an error.
- **No token**: the skill does not use Apple developer credentials or private APIs.

## Network constraint

apps.apple.com rejects cross-origin browser requests; a request carrying an Origin header is answered with 403. The script fetches the product page server-side, so run it where outbound HTTP requests are allowed. Do not attempt the same page fetch from a browser frontend without a server-side proxy. mzstatic image URLs allow CORS and can be displayed directly once known.

## References

Read [references/appstore-data.md](references/appstore-data.md) when changing the parser, debugging missing assets, or building a browser or server proxy. It documents the exact JSON fields, URL templates, and observed examples.

## Install

The skill is self-contained. Copy this folder into the agent's skills directory, or install it from the HQ-ICON repository:

    python3 ~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
      --repo temurlee/HQ-ICON \
      --path skills/app-store-materials

Any agent can also run **scripts/appstore_materials.py** directly without installing the skill.
