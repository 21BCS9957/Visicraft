# Visicraft ad-research scraper (self-hosted)

Thin HTTP service around [meta-ads-collector](https://github.com/promisingcoder/MetaAdsCollector) (MIT).
Scrapes the public Meta Ad Library without an API key and returns ads in the raw Ad Library shape
the app already parses.

## Run locally
```bash
./run.sh            # http://127.0.0.1:8787
```
Then in `Visicraft/.env.local`: `AD_SCRAPER_URL=http://127.0.0.1:8787` (and `SCRAPER_TOKEN` on both sides if you set one).

## Endpoints
- `GET /health`
- `GET /search?query=sleep%20tea&country=IN&media_type=image|video|all&max=60`
- `GET /companies?query=Vahdam&country=IN`
- `GET /page?page_id=1491430561130722&country=IN&media_type=all&max=60`

## Notes
- Meta throttles a single IP after a few dozen requests; set `SCRAPER_PROXIES="host:port:user:pass,..."` (residential) for sustained use.
- The app falls back to ScrapeCreators for a job when this service fails, if `SCRAPECREATORS_API_KEY` is set.
- Deploy anywhere Docker runs (`docker build -t visicraft-scraper . && docker run -p 8787:8787 visicraft-scraper`); Vercel cannot host it.
