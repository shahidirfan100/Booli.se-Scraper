## Selected source (2026)

- Page: `https://www.booli.se/sok/till-salu` with pagination `?page=<n>` (35 listings per page).
- Transport: listings are embedded in the SSR HTML, **not** fetched from a JSON API.
- Data payload: an inline script `(window[Symbol.for("ApolloSSRDataTransport")] ??= []).push({ rehydrate: { ... } })`.
    - Rehydrate entries are Apollo Client query refs (e.g. `_R_<hash>_`). Each holds `data.forSale`, `data.newConstruction`, and `data.sold`.
    - `data.forSale.items[]` is the primary sale result set; `item.listingId`, `item.title`, `item.subtitle`, `item.objectType`, `item.displayPrice`, `item.displayAttributes.dataPoints[]`, `item.images[]`, `item.position`, `item.presenter`, and `item.tracking.properties` hold the listing fields.
    - The rehydrate key hash changes on every render, so listings are located by object shape, not by a fixed key.
- Auth: none, but a Cloudflare managed challenge must be cleared first by a real browser session.
- Pagination: `page` query parameter; `data.forSale.totalCount` reports the total.

## Fields available

`listingId` (Booli listing id / `tracking.booli_id`), `url` (`/bostad/<objectId>` or `/annons/<listingId>`), `title` (address), `subtitle` (object type · area · municipality), `objectType`, `saleType`, `displayPrice`, `displayDate`, `amenities[].label`, `displayAttributes.dataPoints[]` (`livingArea`, `rooms`, `floor`, `rentOrPlotAreaText`, `listSqmPrice`, ...), `images[]` (`id`, `width`, `height`, `blurhash`, `primaryLabel`), `presenter.name` (broker), `position.latitude`/`longitude`, `secondaryStatus.label` (next showing), `tracking.properties` (`booli_id`, `municipality`, `county`, `url`, `upcoming_sale`, `has_images`).

## Access decision (evidence)

The target is protected by a Cloudflare managed ("Just a moment…") challenge, which requires JavaScript execution. All evidence-based HTTP options were evaluated:

| Candidate                                                                                                    | Method  | Result                                                                                | Decision     |
| ------------------------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------- | ------------ |
| 21 impit profiles (`chrome`, `chrome124`, `chrome131`, `chrome136`, `firefox`, `firefox144`, `okhttp*`, ...) | HTTP    | `403` Cloudflare challenge on every profile                                           | Rejected     |
| `chrome100`–`chrome116`, `ios18` impit profiles                                                              | HTTP    | TLS `DecodeError` (connection refused)                                                | Rejected     |
| Legacy `/_next/data/<buildId>/...json`                                                                       | HTTP    | Removed by the App Router migration; no longer exists                                 | Rejected     |
| `api.booli.se`, `/api/`, `/graphql`, mobile/app hosts                                                        | HTTP    | `404` official credentialed API or `403` Cloudflare; `m.`/`app.` hosts do not resolve | Rejected     |
| Bundled-Chromium headless browser (Patchright)                                                               | Browser | CF challenge never clears                                                             | Rejected     |
| **Patchright headful persistent Chrome/Chromium**                                                            | Browser | CF challenge clears in ~12s, Apollo payload available                                 | **Selected** |

Conclusion: impit (all profiles) cannot pass the Cloudflare JS challenge and there is no less-protected JSON API, so the actor uses **Patchright with a headful persistent browser context** (the Apify Docker image provides Xvfb) and reads the SSR Apollo transport payload from the rendered page.

## Discovery Notes

- The previous `__NEXT_DATA__` (Pages Router) payload is gone; the actor no longer relies on it but keeps a fallback reader for it.
- Headless mode is blocked; `headless: false` with `launchPersistentContext` is required.
- Setting `locale: 'sv-SE'` broke the Cloudflare challenge during testing, so locale is not overridden.
- Image CDN pattern verified: `https://bcdn.se/images/cache/<imageId>_640x0.jpg` (HTTP 200).

## Scorecard (Apify Updater)

- Returns structured listing data: +30
- Has >15 unique fields: +25
- No API key required: +20
- Supports pagination: +15
- Matches/extends current fields: +10
- **Total: 100 / 100**
