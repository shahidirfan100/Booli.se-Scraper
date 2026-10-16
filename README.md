## What does Booli.se Scraper do?

Booli.se Scraper collects homes for sale from Booli's Swedish property search pages. Enter a Booli sale-search URL, or use the default search for listings across Sweden, to create a structured dataset with prices, addresses, property details, locations, broker names, and listing links. Use the data for property market research, listing comparisons, or recurring market monitoring.

The Actor follows result pages up to your page limit, removes duplicate listings, and stops when it reaches your result limit. Optional listing details are included when Booli provides them.

## Why use Booli.se Scraper?

- **Compare property listings** - Collect asking prices, room counts, living areas, fees, and property types in one dataset.
- **Track local markets** - Use a Booli search URL with your chosen location and filters, then schedule repeat runs in Apify.
- **Keep useful listing context** - Records can include coordinates, municipality, county, broker, showing details, amenities, and image counts.
- **Use data in other workflows** - Download results or connect the dataset to spreadsheets, webhooks, and other tools.
- **Control collection size** - Set a maximum number of listings and a page limit for each search.

## What data can you extract from Booli?

The Actor returns one dataset item per unique listing. Fields with no value for a listing are omitted.

| Field | Description |
|-------|-------------|
| `source` | Source website, `booli.se` |
| `booliId` | Booli listing identifier |
| `listingId` | Listing identifier supplied by Booli |
| `objectId` | Identifier in the public listing URL |
| `url` | Direct Booli listing URL |
| `address` | Listing address or title |
| `locationText` | Human-readable property type and location summary |
| `objectType` | Property type, such as an apartment, house, or holiday home |
| `saleType` | Sale type supplied by Booli |
| `tenureForm` | Tenure form when available |
| `listPrice` | Asking price as a number |
| `listPriceText` | Asking price as displayed on Booli |
| `listSqmPrice` | Asking price per square meter when available |
| `rooms` | Number of rooms |
| `livingArea` | Living area in square meters |
| `plotArea` | Plot area in square meters when available |
| `floor` | Floor description when available |
| `fee` | Monthly association fee when available |
| `rent` | Monthly rent when available |
| `published` | Publication date text supplied by Booli |
| `daysActive` | Approximate days active, derived from the published date text when possible |
| `latitude` | Listing latitude |
| `longitude` | Listing longitude |
| `municipality` | Municipality name when available |
| `county` | County name when available |
| `brokerName` | Broker or agency name when available |
| `thumbnail` | Preview image URL when available |
| `imageCount` | Number of listing images when available |
| `amenities` | Amenity labels, such as elevator or balcony |
| `showing` | Next scheduled showing when available |
| `upcomingSale` | Whether Booli marks the sale as upcoming |
| `isNewConstruction` | Whether the listing is marked as new construction |
| `searchUrl` | Search URL used for the listing |
| `pageUrl` | Result page URL where the listing appeared |
| `page` | Result page number |

## How to use Booli.se Scraper

1. Open the Actor on Apify.
2. Enter a Booli search page for homes for sale, or keep the default search.
3. Set the maximum number of listings and result pages.
4. Review the proxy settings. Residential proxies in Sweden are selected by default in the input form.
5. Run the Actor and view, export, or connect the dataset.

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startUrl` | String | No | `https://www.booli.se/sok/till-salu` | Booli sale-search URL. Filters in the URL are used for the search. |
| `results_wanted` | Integer | No | `20` | Maximum number of unique listings to save across the run. |
| `max_pages` | Integer | No | `3` | Maximum number of result pages to visit for a search. |
| `proxyConfiguration` | Object | No | Apify Residential Proxy, Sweden | Proxy settings. The default selects the `RESIDENTIAL` group and Sweden (`SE`). |

## Output Data

Each dataset item is a JSON object. Numeric values are numbers, flags are booleans, and `amenities` is an array of strings. Optional values are omitted when unavailable.

| Field | Type | Description |
|-------|------|-------------|
| `source` | String | Always `booli.se`. |
| `booliId` | Integer | Booli listing identifier. |
| `listingId` | String | Listing identifier supplied by Booli. |
| `objectId` | Integer | Identifier parsed from the public listing URL. |
| `url` | String | Direct listing URL. |
| `address` | String | Listing address or title. |
| `locationText` | String | Property type and location summary. |
| `objectType` | String | Property type. |
| `saleType` | String | Sale type supplied by Booli. |
| `tenureForm` | String | Tenure form when available. |
| `listPrice` | Number | Asking price. |
| `listPriceText` | String | Asking price as displayed. |
| `listSqmPrice` | Number | Asking price per square meter when available. |
| `rooms` | Number | Number of rooms. |
| `livingArea` | Number | Living area in square meters. |
| `plotArea` | Number | Plot area in square meters. |
| `floor` | String | Floor description. |
| `fee` | Number | Monthly association fee. |
| `rent` | Number | Monthly rent. |
| `published` | String | Publication date text. |
| `daysActive` | Integer | Approximate number of days active when it can be derived. |
| `latitude` | Number | Latitude coordinate. |
| `longitude` | Number | Longitude coordinate. |
| `municipality` | String | Municipality name. |
| `county` | String | County name. |
| `brokerName` | String | Broker or agency name. |
| `thumbnail` | String | Preview image URL. |
| `imageCount` | Integer | Number of listing images. |
| `amenities` | Array of strings | Amenity labels. |
| `showing` | String | Next scheduled showing. |
| `upcomingSale` | Boolean | Whether the listing is marked as an upcoming sale. |
| `isNewConstruction` | Boolean | Whether the listing is marked as new construction. |
| `searchUrl` | String | Search URL used for the listing. |
| `pageUrl` | String | Result page URL where the listing appeared. |
| `page` | Integer | Result page number. |

## Usage Examples

### Default sale search

Collect up to 20 listings from Booli's default sale search, visiting at most three result pages.

```json
{
  "startUrl": "https://www.booli.se/sok/till-salu",
  "results_wanted": 20,
  "max_pages": 3
}
```

### Filtered area search

Use the search URL copied from Booli after selecting an area or other available filters.

```json
{
  "startUrl": "https://www.booli.se/sok/till-salu?areaIds=1",
  "results_wanted": 50,
  "max_pages": 5
}
```

### Larger collection with Sweden proxy settings

Increase the result and page limits for a larger collection. The proxy configuration below matches the default proxy selection in the Apify input form.

```json
{
  "startUrl": "https://www.booli.se/sok/till-salu",
  "results_wanted": 100,
  "max_pages": 8,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"],
    "apifyProxyCountry": "SE"
  }
}
```

## Sample Output

This example shows one listing record. Optional fields are absent when Booli does not provide them.

```json
{
  "source": "booli.se",
  "booliId": 6294440,
  "listingId": "6294440",
  "objectId": 3442267,
  "url": "https://www.booli.se/bostad/3442267",
  "address": "Brogärdesvägen 7",
  "locationText": "Villa · Blidsberg · Ulricehamn",
  "objectType": "Villa",
  "saleType": "succession",
  "listPrice": 2295000,
  "listPriceText": "2 295 000 kr",
  "rooms": 6,
  "plotArea": 888,
  "published": "Inkommet idag",
  "daysActive": 0,
  "latitude": 57.92902191,
  "longitude": 13.49573674,
  "municipality": "Ulricehamn",
  "county": "Västra Götalands län",
  "brokerName": "LF Fastighetsförmedling",
  "thumbnail": "https://bcdn.se/images/cache/56669227_640x0.jpg",
  "imageCount": 5,
  "amenities": ["Eldstad"],
  "showing": "Mån 26 okt kl 17:00",
  "upcomingSale": false,
  "searchUrl": "https://www.booli.se/sok/till-salu",
  "pageUrl": "https://www.booli.se/sok/till-salu",
  "page": 1
}
```

## Tips for best results

- Copy the complete search URL from Booli so its location and property filters are retained.
- Begin with a small `results_wanted` value to review the dataset before increasing the limit.
- Use `max_pages` to cap how far the Actor follows a search's results.
- The Actor removes duplicate listings across the pages it visits.
- Some records have fewer fields because listing details vary. Booli can change its pages, so report extraction issues through the Actor's Issues tab.
- Residential proxy use is enabled by default in the Apify input form. Proxy availability and account settings can affect whether a run completes.

## Integrations

Use the Apify dataset with the tools that fit your property workflow:

- **JSON** - Work with structured records in applications and data pipelines.
- **CSV** - Review and analyze listings in spreadsheet tools.
- **Excel** - Prepare property reports and comparisons.
- **XML** - Export records for systems that accept XML.
- **Apify API** - Read run datasets from your applications.
- **Webhooks, Make, and Zapier** - Pass completed run data to connected workflows.
- **Google Sheets and Airtable** - Organize and review collected listings.

## Frequently Asked Questions

### How many listings can I collect per run?

The Actor saves up to `results_wanted` unique listings. The number available also depends on the Booli search results and the `max_pages` limit.

### Does the Actor follow additional result pages?

Yes. It visits result pages up to `max_pages` and stops earlier when it reaches `results_wanted` or the search has no more listings.

### Can I use a location or property filter?

Yes. Select the filters on Booli and provide the resulting sale-search URL as `startUrl`.

### Why are some fields missing?

Booli does not publish every detail for every listing. The Actor omits fields with no available value.

### Can I export listings to CSV or Excel?

Yes. Export the Apify dataset as CSV, Excel, JSON, XML, or another format supported by Apify.

### Can I schedule recurring runs?

Yes. Create a schedule in Apify Console to run the Actor at a recurring interval, then use the resulting datasets to monitor changes over time.

### Are proxies required?

The input form selects Apify Residential Proxy in Sweden by default. Availability depends on your Apify account and proxy settings. A blocked page or a change to Booli may still prevent a run from collecting listings.

## Related Actors

- [Propertyfinder Scraper](https://apify.com/shahidirfan/propertyfinder-scraper) - Collect property listings from Property Finder in the UAE.
- [iProperty Scraper](https://apify.com/shahidirfan/iproperty-scraper) - Collect property listings from iProperty Malaysia.

## Support

For issues or feature requests, use the Issues tab on the Actor's Apify page. For custom Actor work, contact the developer through Apify.

## Legal Notice

Review [Booli's current terms of use](https://www.booli.se/integritet/anvandarvillkor) before running the Actor. Booli's terms prohibit disrupting the service or accessing it through methods other than the interface and instructions it provides. They also state that content on Booli may be protected by Booli's or third parties' intellectual property rights. Obtain any permission required for your collection and reuse of listing data, text, and images. You are responsible for complying with applicable terms, laws, privacy requirements, and rights attached to collected content.
