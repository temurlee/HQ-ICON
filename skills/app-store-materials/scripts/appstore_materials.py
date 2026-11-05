#!/usr/bin/env python3
"""Fetch official App Store icons, screenshots, and featured materials."""

import argparse
import json
import re
import shutil
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlparse
from urllib.request import Request, urlopen

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"
)
DEFAULT_TIMEOUT = 30
SCREENSHOT_SOURCES = (
    ("iPhone", "screenshotUrls"),
    ("iPad", "ipadScreenshotUrls"),
    ("Apple TV", "appletvScreenshotUrls"),
)
APP_KINDS = {"software", "mac-software"}


def fetch_bytes(url, timeout, accept="*/*", language=None):
    headers = {"User-Agent": USER_AGENT, "Accept": accept}
    if language:
        headers["Accept-Language"] = language
    request = Request(url, headers=headers)
    with urlopen(request, timeout=timeout) as response:
        return response.read()


def fetch_json(url, timeout):
    return json.loads(fetch_bytes(url, timeout).decode("utf-8"))


def parse_app_input(value):
    value = value.strip()
    id_match = re.fullmatch(r"(?:id)?(\d{6,})", value, re.I)
    if id_match:
        return {"id": id_match.group(1), "country": None}

    if value.startswith(("http://", "https://")):
        parsed = urlparse(value)
        if parsed.hostname != "apps.apple.com":
            raise ValueError("Only apps.apple.com links are supported")
        id_match = re.search(r"/id(\d+)(?:[/?#]|$)", parsed.path)
        if not id_match:
            raise ValueError("Could not find an App Store app ID in the link")
        country_match = re.match(r"^/([a-z]{2})(?:/|$)", parsed.path, re.I)
        return {
            "id": id_match.group(1),
            "country": country_match.group(1).lower() if country_match else None,
        }

    return None


def resolve_apps(query, country, entity, limit, timeout):
    parsed = parse_app_input(query)
    if parsed:
        app_country = parsed["country"] or country
        params = {"id": parsed["id"], "country": app_country}
        data = fetch_json(
            "https://itunes.apple.com/lookup?" + urlencode(params), timeout
        )
    else:
        app_country = country
        params = {
            "term": query,
            "country": country,
            "entity": entity,
            "limit": limit,
        }
        data = fetch_json(
            "https://itunes.apple.com/search?" + urlencode(params), timeout
        )

    results = [
        item
        for item in data.get("results", [])
        if item.get("artworkUrl512") and item.get("kind") in APP_KINDS
    ]
    if not results:
        raise RuntimeError("No App Store app results found")
    return app_country, results


def build_icon(artwork_url_512, size, fmt):
    match = re.search(r"/512x512bb\.[a-z0-9]+$", artwork_url_512 or "", re.I)
    if not match:
        return {"sourceUrl": artwork_url_512, "official": None, "raw": None}

    base = artwork_url_512[: match.start()]
    ext = "jpg" if fmt == "jpeg" else fmt
    return {
        "sourceUrl": artwork_url_512,
        "official": {
            "url": f"{base}/{size}x{size}ia-100.{ext}",
            "width": size,
            "height": size,
            "format": ext,
        },
        "raw": {
            "url": f"{base}/{size}x{size}bb-100.{ext}",
            "width": size,
            "height": size,
            "format": ext,
        },
    }


def get_extension(url, default="jpg"):
    match = re.search(r"\.([a-z0-9]+)(?:[?#]|$)", url or "", re.I)
    return match.group(1).lower() if match else default


def build_screenshot_groups(app):
    is_mac = app.get("kind") == "mac-software"
    groups = []
    for platform, key in SCREENSHOT_SOURCES:
        label = "macOS" if key == "screenshotUrls" and is_mac else platform
        urls = app.get(key) or []
        screenshots = []
        for preview_url in urls:
            if not isinstance(preview_url, str):
                continue
            download_url = re.sub(
                r"/\d+x\d+bb\.([a-z0-9]+)$",
                r"/4096x4096bb.\1",
                preview_url,
                flags=re.I,
            )
            screenshots.append(
                {"previewUrl": preview_url, "downloadUrl": download_url}
            )
        if screenshots:
            groups.append({"platform": label, "screenshots": screenshots})
    return groups


def artwork_url(artwork, width, height, crop="bb", fmt="jpg"):
    template = artwork.get("template")
    if not template or not width or not height:
        return None
    return (
        template.replace("{w}", str(width))
        .replace("{h}", str(height))
        .replace("{c}", crop)
        .replace("{f}", fmt)
    )


def build_artwork_assets(artwork, preview_width):
    if not artwork or not artwork.get("template"):
        return None

    source_width = int(artwork.get("width") or preview_width)
    source_height = int(
        artwork.get("height") or round(preview_width * 9 / 16)
    )
    ratio = source_height / source_width if source_width else 9 / 16
    preview_height = max(1, round(preview_width * ratio))
    download_width = max(source_width, 1600)
    download_height = max(1, round(download_width * ratio))

    return {
        "previewUrl": artwork_url(
            artwork, preview_width, preview_height
        ),
        "downloadUrl": artwork_url(
            artwork, download_width, download_height
        ),
        "width": source_width,
        "height": source_height,
    }


def extract_featured(html):
    match = re.search(
        r"<script[^>]*id=[\"']serialized-server-data[\"'][^>]*>"
        r"(.*?)</script>",
        html,
        re.S | re.I,
    )
    if not match:
        return {"hero": None, "topics": []}

    try:
        parsed = json.loads(match.group(1))
        page = parsed["data"][0]["data"]
    except (json.JSONDecodeError, KeyError, IndexError, TypeError):
        return {"hero": None, "topics": []}

    hero = build_artwork_assets(
        (page.get("uber") or {}).get("artwork"), 1200
    )
    items = (
        ((page.get("shelfMapping") or {}).get("featuredIn") or {}).get(
            "items"
        )
        or []
    )
    topics = []
    seen = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        url = (item.get("clickAction") or {}).get("pageUrl")
        artworks = (item.get("media") or {}).get("artworks") or []
        artwork = artworks[0] if artworks else None
        if not url or not artwork or url in seen:
            continue
        assets = build_artwork_assets(artwork, 400)
        if not assets:
            continue
        seen.add(url)
        topics.append(
            {
                "title": item.get("title") or "",
                "heading": item.get("heading") or "",
                "url": url,
                **assets,
            }
        )
        if len(topics) >= 6:
            break

    return {"hero": hero, "topics": topics}


def fetch_featured(app_id, country, timeout):
    url = (
        f"https://apps.apple.com/{quote(country)}/app/id"
        + quote(str(app_id))
    )
    language = "zh-CN,zh;q=0.9" if country == "cn" else "en-US,en;q=0.9"
    html = fetch_bytes(
        url,
        timeout,
        accept="text/html,application/xhtml+xml",
        language=language,
    ).decode("utf-8", "replace")
    return extract_featured(html)


def sanitize_name(name):
    cleaned = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", name or "").strip()
    return cleaned or "app"


def download_asset(url, destination, timeout):
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=timeout) as response, open(
        destination, "wb"
    ) as handle:
        shutil.copyfileobj(response, handle)
    return str(destination)


def download_result(result, output_dir, args, multiple):
    app_name = sanitize_name(result.get("trackName"))
    prefix = (
        f"{app_name}-{result.get('trackId')}" if multiple else app_name
    )
    downloads = {"icon": [], "screenshots": [], "featured": []}

    if "icon" in args.types:
        icon = result.get("icon") or {}
        variants = []
        if args.cut in ("official", "both") and icon.get("official"):
            variants.append(("official", icon["official"]))
        if args.cut in ("raw", "both") and icon.get("raw"):
            variants.append(("raw", icon["raw"]))
        for label, variant in variants:
            ext = variant.get("format") or args.format
            filename = f"{prefix}-icon-{label}-{args.size}.{ext}"
            try:
                downloads["icon"].append(
                    download_asset(
                        variant["url"],
                        output_dir / filename,
                        args.timeout,
                    )
                )
            except (HTTPError, URLError, OSError) as error:
                print(
                    f"warning: icon download failed: {error}",
                    file=sys.stderr,
                )

    if "screenshots" in args.types:
        for group in result.get("screenshots") or []:
            platform = sanitize_name(group.get("platform")).replace(
                " ", "-"
            )
            for index, shot in enumerate(
                group.get("screenshots") or [], 1
            ):
                ext = get_extension(shot.get("downloadUrl"))
                filename = f"{prefix}-{platform}-{index}.{ext}"
                try:
                    downloads["screenshots"].append(
                        download_asset(
                            shot["downloadUrl"],
                            output_dir / filename,
                            args.timeout,
                        )
                    )
                except (HTTPError, URLError, OSError) as error:
                    print(
                        f"warning: screenshot download failed: {error}",
                        file=sys.stderr,
                    )

    if "featured" in args.types:
        featured = result.get("featured") or {}
        hero = featured.get("hero")
        if hero:
            ext = get_extension(hero.get("downloadUrl"))
            filename = f"{prefix}-hero.{ext}"
            try:
                downloads["featured"].append(
                    download_asset(
                        hero["downloadUrl"],
                        output_dir / filename,
                        args.timeout,
                    )
                )
            except (HTTPError, URLError, OSError) as error:
                print(
                    f"warning: hero download failed: {error}",
                    file=sys.stderr,
                )
        for index, topic in enumerate(
            featured.get("topics") or [], 1
        ):
            ext = get_extension(topic.get("downloadUrl"))
            filename = f"{prefix}-topic-{index}.{ext}"
            try:
                downloads["featured"].append(
                    download_asset(
                        topic["downloadUrl"],
                        output_dir / filename,
                        args.timeout,
                    )
                )
            except (HTTPError, URLError, OSError) as error:
                print(
                    f"warning: topic download failed: {error}",
                    file=sys.stderr,
                )

    return downloads


def build_manifest(app, country, args):
    featured = None
    featured_error = None
    if not args.no_featured:
        try:
            featured = fetch_featured(
                app.get("trackId"), country, args.timeout
            )
        except (HTTPError, URLError, OSError, ValueError) as error:
            featured = {"hero": None, "topics": []}
            featured_error = str(error)

    result = {
        "trackId": app.get("trackId"),
        "trackName": app.get("trackName"),
        "artistName": app.get("artistName"),
        "kind": app.get("kind"),
        "primaryGenreName": app.get("primaryGenreName"),
        "bundleId": app.get("bundleId"),
        "version": app.get("version"),
        "trackViewUrl": app.get("trackViewUrl"),
        "icon": build_icon(
            app.get("artworkUrl512"), args.size, args.format
        ),
        "screenshots": build_screenshot_groups(app),
        "featured": featured,
    }
    if featured_error:
        result["featuredError"] = featured_error
    return result


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Fetch App Store icons, screenshots, hero artwork, "
            "and related editorial topics."
        )
    )
    parser.add_argument(
        "query", help="App name, App Store link, or numeric app ID"
    )
    parser.add_argument(
        "--country",
        default="us",
        help="Two-letter storefront country (default: us)",
    )
    parser.add_argument(
        "--entity",
        default="software",
        choices=["software", "iPadSoftware", "desktopSoftware"],
        help="iTunes search entity (default: software)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=5,
        help="Maximum search results (default: 5)",
    )
    parser.add_argument(
        "--size",
        type=int,
        default=1024,
        choices=[256, 512, 1024],
        help="Icon size in pixels (default: 1024)",
    )
    parser.add_argument(
        "--format",
        default="png",
        choices=["png", "jpg", "jpeg", "webp"],
        help="Icon format (default: png)",
    )
    parser.add_argument(
        "--cut",
        default="official",
        choices=["official", "raw", "both"],
        help="Icon variant to download (default: official)",
    )
    parser.add_argument(
        "--types",
        default="icon,screenshots,featured",
        help=(
            "Comma-separated download types: "
            "icon,screenshots,featured"
        ),
    )
    parser.add_argument(
        "--no-featured",
        action="store_true",
        help="Skip App Store product page parsing",
    )
    parser.add_argument(
        "--download",
        metavar="DIR",
        help="Download selected assets into DIR",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT,
        help="HTTP timeout in seconds (default: 30)",
    )
    parser.add_argument(
        "--compact",
        action="store_true",
        help="Print compact JSON",
    )
    args = parser.parse_args()

    if not 1 <= args.limit <= 200:
        parser.error("--limit must be between 1 and 200")
    if not re.fullmatch(r"[a-z]{2}", args.country.lower()):
        parser.error("--country must be a two-letter code")

    types = {
        part.strip().lower()
        for part in args.types.split(",")
        if part.strip()
    }
    if not types <= {"icon", "screenshots", "featured"}:
        parser.error(
            "--types must contain icon, screenshots, or featured"
        )
    args.types = types
    args.format = "jpg" if args.format == "jpeg" else args.format

    try:
        country, apps = resolve_apps(
            args.query,
            args.country.lower(),
            args.entity,
            args.limit,
            args.timeout,
        )
        results = []
        for app in apps:
            result = build_manifest(app, country, args)
            if args.download:
                result["downloads"] = download_result(
                    result,
                    Path(args.download),
                    args,
                    len(apps) > 1,
                )
            results.append(result)
        manifest = {
            "query": args.query,
            "country": country,
            "results": results,
        }
        print(
            json.dumps(
                manifest,
                ensure_ascii=False,
                indent=None if args.compact else 2,
            )
        )
    except (HTTPError, URLError, RuntimeError, ValueError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
