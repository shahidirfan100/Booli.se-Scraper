# Booli.se Scraper

Collect sale listings from Booli search pages with a dataset focused on usable property data. Capture listing identifiers, price points, size metrics, broker metadata, image links, coordinates, and other listing attributes from Booli search results. This actor is designed for monitoring supply, market research, pricing analysis, and building structured real-estate datasets.

---

## Features

- **Sale search coverage** - Scrape `till-salu` result pages from Booli with configurable page and result limits.
- **Rich listing fields** - Capture core fields such as address, location, property type, pricing, room counts, area data, coordinates, broker info, and media links.
- **Clean dataset output** - Drop empty values so the dataset does not fill up with always-null keys.
- **Pagination support** - Continue across multiple result pages until the requested limit is reached.
- **Apify-ready input** - Works with a default Booli search URL and QA-friendly defaults.

---

## Use Cases

### Market Monitoring
Track newly active listings, property mix, and price movements across Booli search pages. Use the dataset for recurring snapshots and supply comparisons.

### Lead Research
Collect broker-facing listing data, addresses, and URLs for sales research, outreach preparation, or neighborhood-level tracking.

### Pricing Analysis
Build datasets of listing prices, room counts, and living areas to compare asking-price patterns across different searches.

### Real-Estate Intelligence
Create structured feeds for dashboards, BI tools, or custom workflows that need clean property-listing records.

---

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startUrl` | String | No | `https://www.booli.se/sok/till-salu` | Booli search URL to start from. |
| `results_wanted` | Integer | No | `20` | Maximum number of listings to save. |
| `max_pages` | Integer | No | `3` | Safety cap on how many search pages to visit. |
| `proxyConfiguration` | Object | No | Apify Residential Proxy | Proxy settings for more reliable production runs. |

---

## Output Data

Each dataset item contains a cleaned listing object with only non-empty values. Common fields include:

| Field | Type | Description |
|-------|------|-------------|
| `booliId` | Integer | Booli listing identifier. |
| `url` | String | Absolute listing URL. |
| `address` | String | Listing address. |
| `locationText` | String | Human-readable location summary. |
| `objectType` | String | Property type. |
| `listPrice` | Number | Advertised list price. |
| `rent` | Number | Monthly rent when available. |
| `fee` | Number | Monthly association fee when available. |
| `rooms` | Number | Number of rooms. |
| `livingArea` | Number | Living area in square meters. |
| `plotArea` | Number | Plot area in square meters when available. |
| `daysActive` | Integer | Number of days the listing has been active. |
| `published` | String | Publish timestamp or date when available. |
| `latitude` | Number | Latitude coordinate. |
| `longitude` | Number | Longitude coordinate. |
| `brokerName` | String | Broker or office name when available. |
| `thumbnail` | String | Listing image URL when available. |
| `page` | Integer | Page number where the listing was collected. |
| `searchUrl` | String | Root search URL used for the run. |

Additional non-empty listing fields can also appear when Booli exposes them in the search payload.

---

## Usage Examples

### Default Sale Search

```json
{
	"startUrl": "https://www.booli.se/sok/till-salu",
	"results_wanted": 20,
	"max_pages": 3
}
```

### Area-Specific Search

```json
{
	"startUrl": "https://www.booli.se/sok/till-salu/stockholm",
	"results_wanted": 50,
	"max_pages": 5
}
```

### Production Run With Residential Proxy

```json
{
	"startUrl": "https://www.booli.se/sok/till-salu",
	"results_wanted": 100,
	"max_pages": 8,
	"proxyConfiguration": {
		"useApifyProxy": true,
		"apifyProxyGroups": ["RESIDENTIAL"]
	}
}
```

---

## Sample Output

```json
{
	"booliId": 1234567,
	"source": "booli.se",
	"url": "https://www.booli.se/bostad/1234567",
	"address": "Examplegatan 12",
	"locationText": "Examplegatan 12, Stockholm",
	"objectType": "Lagenhet",
	"listPrice": 5495000,
	"rent": 2490,
	"fee": 2490,
	"rooms": 3,
	"livingArea": 78,
	"daysActive": 2,
	"latitude": 59.334591,
	"longitude": 18.06324,
	"brokerName": "Example Makleri",
	"thumbnail": "https://example-cdn.booli.se/image.jpg",
	"page": 1,
	"searchUrl": "https://www.booli.se/sok/till-salu"
}
```

---

## Tips for Best Results

### Use Working Search URLs
- Start from a Booli sale-search URL that already shows the filters you want.
- Keep location, property type, or other search filters inside the URL itself.

### Keep QA Runs Small
- Use `results_wanted: 20` for short validation runs.
- Increase limits after confirming the target search behaves as expected.

### Prefer Residential Proxies
- Residential proxies are recommended for steadier production runs.
- If you run locally without an Apify proxy token, the actor falls back to direct browsing.

---

## Integrations

- **Google Sheets** - Export listing datasets for quick review.
- **Airtable** - Store searchable property records.
- **Make** - Trigger follow-up automations from fresh listings.
- **Zapier** - Send new dataset items into downstream tools.
- **Webhooks** - Push data into custom applications.

### Export Formats

- **JSON** - For APIs and application pipelines.
- **CSV** - For spreadsheet and tabular analysis.
- **Excel** - For business reporting.
- **XML** - For external system imports.

---

## Frequently Asked Questions

### How many listings can I collect?
You can collect as many as the search results expose, bounded by your `results_wanted` and `max_pages` settings.

### Does the actor handle pagination?
Yes. It moves through additional result pages until it reaches the requested listing limit or page cap.

### Why are some fields missing on some items?
The actor removes empty values, so fields only appear when Booli exposes them for that listing.

### Can I use filtered Booli searches?
Yes. Put your desired Booli filters directly into `startUrl`.

### Do I need proxies?
For reliable production runs, residential proxies are recommended.

---

## Support

For issues or feature requests, use the Apify Console issue and support channels tied to the actor.

### Resources

- [Apify Documentation](https://docs.apify.com/)
- [Apify API Reference](https://docs.apify.com/api/v2)
- [Scheduling Runs](https://docs.apify.com/platform/schedules)

---

## Legal Notice

This actor is intended for legitimate data collection and analysis. You are responsible for ensuring your use complies with website terms and applicable laws.