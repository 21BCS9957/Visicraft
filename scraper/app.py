"""
Visicraft ad-research sidecar: a thin HTTP service around meta-ads-collector
(MIT) that scrapes the public Meta Ad Library without an API key.

Endpoints return ads in the raw Ad Library shape (snake_case, with `snapshot`),
which the Next.js pipeline already parses, so this service is a drop-in
provider next to ScrapeCreators/Apify.

Run locally:  ./run.sh   (or: uvicorn app:app --port 8787)
Env:          SCRAPER_PROXIES="host:port:user:pass,host:port"  (optional)
              SCRAPER_RATE_DELAY=2.0   SCRAPER_TOKEN=<shared secret, optional>
"""
from __future__ import annotations

import os
import threading
import time
from dataclasses import asdict
from typing import Any, Optional

from fastapi import FastAPI, Header, HTTPException, Query
from meta_ads_collector import MetaAdsCollector

app = FastAPI(title="visicraft-ad-scraper", version="1.0")

COLLECTOR_MAX_AGE = 25 * 60  # rebuild a session well within Meta's ~30 min session age
POOL_SIZE = int(os.getenv("SCRAPER_CONCURRENCY", "3"))


class CollectorPool:
    """A few independent sessions so the app's parallel research jobs overlap
    instead of queueing behind one rate limiter."""

    def __init__(self, size: int) -> None:
        self._free: list[tuple[MetaAdsCollector, float]] = []
        self._slots = threading.Semaphore(size)
        self._lock = threading.Lock()

    def _make(self) -> MetaAdsCollector:
        proxies = [p.strip() for p in os.getenv("SCRAPER_PROXIES", "").split(",") if p.strip()]
        return MetaAdsCollector(
            proxy=proxies if len(proxies) > 1 else (proxies[0] if proxies else None),
            rate_limit_delay=float(os.getenv("SCRAPER_RATE_DELAY", "0.6")),
            jitter=float(os.getenv("SCRAPER_JITTER", "0.4")),
            timeout=30,
            max_retries=3,
        )

    def acquire(self) -> MetaAdsCollector:
        self._slots.acquire()
        with self._lock:
            while self._free:
                c, born = self._free.pop()
                if time.time() - born < COLLECTOR_MAX_AGE:
                    return c
                try:
                    c.close()
                except Exception:
                    pass
        return self._make()

    def release(self, c: MetaAdsCollector) -> None:
        with self._lock:
            self._free.append((c, time.time()))
        self._slots.release()


_pool = CollectorPool(POOL_SIZE)


class borrowed:
    """with borrowed() as c: ... — takes a collector from the pool and returns it."""

    def __enter__(self) -> MetaAdsCollector:
        self.c = _pool.acquire()
        return self.c

    def __exit__(self, *exc: object) -> None:
        _pool.release(self.c)


def require_token(x_scraper_token: Optional[str]) -> None:
    expected = os.getenv("SCRAPER_TOKEN")
    if expected and x_scraper_token != expected:
        raise HTTPException(status_code=401, detail="bad token")


def to_unix(dt: Any) -> Optional[int]:
    if dt is None:
        return None
    try:
        return int(dt.timestamp())
    except Exception:
        return None


def normalise(ad: Any) -> dict:
    """Prefer the raw Ad Library node; otherwise rebuild that shape from the dataclass."""
    raw = ad.raw_data if isinstance(getattr(ad, "raw_data", None), dict) else None
    if raw and isinstance(raw.get("snapshot"), dict) and raw.get("ad_archive_id"):
        node = dict(raw)
        node.setdefault("collation_count", ad.collation_count)
        node.setdefault("is_active", ad.is_active)
        return node

    page = ad.page
    creatives = ad.creatives or []
    first = creatives[0] if creatives else None
    body_text = (first.body if first else None) or ""
    images = [{"original_image_url": c.image_url, "resized_image_url": c.image_url} for c in creatives if c.image_url and not (c.video_sd_url or c.video_hd_url)]
    videos = [
        {"video_sd_url": c.video_sd_url or c.video_url, "video_hd_url": c.video_hd_url, "video_preview_image_url": c.thumbnail_url or c.image_url}
        for c in creatives
        if c.video_sd_url or c.video_hd_url or c.video_url
    ]
    cards = [
        {
            "title": c.title,
            "body": c.body,
            "link_url": c.link_url,
            "cta_text": c.cta_text,
            "original_image_url": c.image_url,
            "video_sd_url": c.video_sd_url,
            "video_hd_url": c.video_hd_url,
            "video_preview_image_url": c.thumbnail_url,
        }
        for c in creatives[1:]
    ]
    return {
        "ad_archive_id": ad.id,
        "page_id": page.id if page else None,
        "page_name": page.name if page else None,
        "is_active": ad.is_active,
        "start_date": to_unix(ad.delivery_start_time),
        "end_date": to_unix(ad.delivery_stop_time),
        "collation_count": ad.collation_count,
        "collation_id": ad.collation_id,
        "publisher_platform": ad.publisher_platforms or [],
        "snapshot": {
            "display_format": "VIDEO" if videos else ("CAROUSEL" if len(creatives) > 1 else "IMAGE"),
            "title": first.title if first else None,
            "body": {"text": body_text},
            "cta_text": first.cta_text if first else None,
            "caption": first.caption if first else None,
            "link_url": first.link_url if first else None,
            "page_name": page.name if page else None,
            "images": images,
            "videos": videos,
            "cards": cards,
        },
    }


@app.get("/health")
def health() -> dict:
    return {"ok": True, "proxies": bool(os.getenv("SCRAPER_PROXIES")), "concurrency": POOL_SIZE}


@app.get("/search")
def search(
    query: str = Query(..., min_length=1),
    country: str = "IN",
    media_type: str = "all",
    status: str = "ACTIVE",
    max: int = Query(60, ge=1, le=300),
    x_scraper_token: Optional[str] = Header(default=None),
) -> dict:
    """Keyword search, sorted by impressions, post-filtered by media type."""
    require_token(x_scraper_token)
    started = time.time()
    with borrowed() as c:
        try:
            ads = c.collect(query=query, country=country.upper(), status=status.upper(), max_results=max, page_size=30)
        except Exception as exc:  # session/rate-limit/proxy errors surface as 502 for the caller to fall back
            raise HTTPException(status_code=502, detail=f"{type(exc).__name__}: {exc}") from exc
    items = [normalise(a) for a in ads]
    items = filter_media(items, media_type)
    return {"items": items, "count": len(items), "elapsed_ms": int((time.time() - started) * 1000)}


@app.get("/companies")
def companies(query: str = Query(..., min_length=1), country: str = "IN", x_scraper_token: Optional[str] = Header(default=None)) -> dict:
    require_token(x_scraper_token)
    with borrowed() as c:
        try:
            pages = c.search_pages(query, country=country.upper())
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"{type(exc).__name__}: {exc}") from exc
    return {"items": [{"page_id": p.page_id, "name": p.page_name, "alias": p.page_alias, "likes": p.page_like_count, "verified": p.page_verified} for p in pages]}


@app.get("/page")
def page_ads(
    page_id: str = Query(..., min_length=1),
    country: str = "IN",
    media_type: str = "all",
    status: str = "ACTIVE",
    max: int = Query(60, ge=1, le=300),
    x_scraper_token: Optional[str] = Header(default=None),
) -> dict:
    """All active ads of one advertiser page, sorted by impressions."""
    require_token(x_scraper_token)
    started = time.time()
    with borrowed() as c:
        try:
            ads = c.collect(query="", country=country.upper(), status=status.upper(), search_type="PAGE", page_ids=[page_id], max_results=max, page_size=30)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"{type(exc).__name__}: {exc}") from exc
    items = filter_media([normalise(a) for a in ads], media_type)
    return {"items": items, "count": len(items), "elapsed_ms": int((time.time() - started) * 1000)}


def filter_media(items: list[dict], media_type: str) -> list[dict]:
    want = media_type.lower()
    if want in ("all", "", "any"):
        return items
    out = []
    for item in items:
        snap = item.get("snapshot") or {}
        has_video = bool(snap.get("videos")) or any((c or {}).get("video_sd_url") or (c or {}).get("video_hd_url") for c in snap.get("cards") or [])
        if want == "video" and has_video:
            out.append(item)
        elif want == "image" and not has_video:
            out.append(item)
    return out


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("PORT", "8787")))
