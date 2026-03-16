## Selected API
- Endpoint: `https://www.booli.se/_next/data/<buildId>/sv/sok/till-salu.json?searchType=till-salu&page=<page>`
- Method: `GET`
- Auth: No API key. Cloudflare challenge/cookies required before direct fetch.
- Pagination: `page` query parameter and `pages` metadata in `ROOT_QUERY.searchForSale(...).pages`
- Fields available: `booliId`, `id`, `url`, `streetAddress`, `descriptiveAreaName`, `objectType`, `listPrice.value`, `listPrice.raw`, `rent.raw`, `rooms.formatted`, `livingArea.formatted`, `plotArea.formatted`, `floor.formatted`, `daysActive`, `published`, `latitude`, `longitude`, `tenureForm`, `upcomingSale`, `biddingOpen`, `isNewConstruction`, `listSqmPrice.formatted`, `mortgageDeed`, `operatingCost.raw`, `estimate.price.raw`, `nextShowing.startTime`, `location.region.municipalityName`, `amenities[].key`, `amenities[].label`, `primaryImage.id`, `primaryImage.blurhash` and other listing fields.
- Fields currently missing in actor: `descriptiveAreaName`, `tenureForm`, `upcomingSale`, `biddingOpen`, `isNewConstruction`, `listSqmPrice`, `mortgageDeed`, `operatingCost`, `estimate.price`, `nextShowing.startTime`, `amenities`, `primaryImage.blurhash`.
- Field count: `54` discovered field paths (vs ~`19` documented output fields previously).

## Discovery Notes
- URLScan lookup used existing public scan for search page: `91cad6f1-70c0-497b-9267-466702ad5862`.
- Rich response body confirmed via URLScan response hash: `d51a3cc570680428f8800282de962c6f7c6806c593321e0763d5fb6fdf588f75`.
- Listing data structure is Apollo graph refs: `pageProps.__APOLLO_STATE__.ROOT_QUERY.searchForSale(...).result[] -> Listing:*`.
- Previous extraction failed because it expected listing arrays directly; current payload stores listings by reference objects.

## Scorecard (Apify Updater)
- Returns JSON directly: +30
- Has >15 unique fields: +25
- No API key required: +20
- Supports pagination: +15
- Matches/extends current fields: +10
- **Total: 100 / 100**
