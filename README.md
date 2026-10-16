## What does Booli.se Scraper do?

Booli.se Scraper collects property sale listings from Booli, Sweden's property listing site. Give it a Booli sale-search URL and it returns structured listing data such as address, asking price, room count, living area, monthly fee, coordinates, broker, amenities, and the direct listing link. It is built for property monitoring, market research, and building clean real-estate datasets without manual copy-paste.

## Why use Booli.se Scraper?

- **Reliable collection** - Pages protected by anti-bot checks are handled automatically, and failed attempts are retried before a run gives up.
- **Rich listing records** - Each item combines pricing, size, location, broker, showing, and media details from the listing card.
- **Search any Booli filter** - Paste any Booli sale-search URL, including location or property-type filters, and collect exactly that result set.
- **Pagination built in** - The scraper walks across result pages until it reaches your listing limit or page cap.
- **Clean, empty-free output** - Fields that the source does not publish are dropped so the dataset stays tidy.
- **Automation-ready** - Schedule runs, export to CSV, Excel, JSON, or XML, and connect results to spreadsheets, warehouses, or apps.

## What data can you extract from Booli?

| Field                    | Description                                       |
| ------------------------ | ------------------------------------------------- |
| `booliId`                | Booli listing identifier                          |
| `listingId`              | Internal Booli listing ID                         |
| `objectId`               | Identifier used in the public listing URL         |
| `url`                    | Direct listing URL                                |
| `address`                | Listing address                                   |
| `locationText`           | Object type, area, and municipality summary       |
| `objectType`             | Property type, such as apartment or house         |
| `saleType`               | Sale type, such as succession or new construction |
| `listPrice`              | Advertised asking price                           |
| `listPriceText`          | Asking price exactly as displayed                 |
| `rooms`                  | Number of rooms                                   |
| `livingArea`             | Living area in square meters                      |
| `plotArea`               | Plot area in square meters when available         |
| `floor`                  | Floor description                                 |
| `fee`                    | Monthly association fee when available            |
| `rent`                   | Monthly rent when available                       |
| `published`              | Publication date text                             |
| `daysActive`             | Approximate days the listing has been active      |
| `latitude` / `longitude` | Listing coordinates                               |
| `municipality`           | Municipality name                                 |
| `county`                 | County name                                       |
| `brokerName`             | Broker or agency name                             |
| `thumbnail`              | Preview image URL                                 |
| `imageCount`             | Number of images on the listing                   |
| `amenities`              | Amenity labels such as elevator or balcony        |
| `showing`                | Next scheduled showing                            |
| `upcomingSale`           | Whether the sale is upcoming                      |
| `page`                   | Result page the listing was collected from        |

## How to use Booli.se Scraper

1. Open the Actor on Apify Store.
2. Paste a Booli sale-search URL into `startUrl`, or leave the default to use all of Sweden.
3. Set `results_wanted` and `max_pages` to control how much data is collected.
4. Run the Actor.
5. Download the dataset or connect it to Google Sheets, webhooks, or your own systems.

## Input Parameters

| Parameter            | Type    | Required | Default                              | Description                                                                       |
| -------------------- | ------- | -------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| `startUrl`           | String  | No       | `https://www.booli.se/sok/till-salu` | Booli sale-search URL to start from. Filters placed in the URL are respected.     |
| `results_wanted`     | Integer | No       | `20`                                 | Maximum number of listings to save.                                               |
| `max_pages`          | Integer | No       | `3`                                  | Safety cap on how many result pages to visit.                                     |
| `proxyConfiguration` | Object  | No       | Apify Residential Proxy              | Proxy settings for reliable production runs. Residential proxies are recommended. |

## Output Data

Each dataset item is a listing object that contains only non-empty values. The most useful fields are:

| Field           | Type    | Description                                   |
| --------------- | ------- | --------------------------------------------- |
| `booliId`       | Integer | Booli listing identifier.                     |
| `url`           | String  | Direct listing URL.                           |
| `address`       | String  | Listing address.                              |
| `locationText`  | String  | Object type, area, and municipality summary.  |
| `objectType`    | String  | Property type.                                |
| `saleType`      | String  | Sale type.                                    |
| `listPrice`     | Number  | Advertised asking price.                      |
| `listPriceText` | String  | Asking price as displayed.                    |
| `rooms`         | Number  | Number of rooms.                              |
| `livingArea`    | Number  | Living area in square meters.                 |
| `plotArea`      | Number  | Plot area in square meters when available.    |
| `floor`         | String  | Floor description.                            |
| `fee`           | Number  | Monthly association fee when available.       |
| `rent`          | Number  | Monthly rent when available.                  |
| `published`     | String  | Publication date text.                        |
| `daysActive`    | Integer | Approximate days the listing has been active. |
| `latitude`      | Number  | Latitude coordinate.                          |
| `longitude`     | Number  | Longitude coordinate.                         |
| `municipality`  | String  | Municipality name.                            |
| `county`        | String  | County name.                                  |
| `brokerName`    | String  | Broker or agency name.                        |
| `thumbnail`     | String  | Preview image URL.                            |
| `amenities`     | Array   | Amenity labels.                               |
| `showing`       | String  | Next scheduled showing.                       |
| `page`          | Integer | Result page the listing was collected from.   |

## Usage Examples

### Default Sale Search

Collect the first listings across all of Sweden:

```json
{
    "startUrl": "https://www.booli.se/sok/till-salu",
    "results_wanted": 20,
    "max_pages": 3
}
```

### Area-Specific Search

Collect listings for a specific area or property type by using a filtered Booli search URL:

```json
{
    "startUrl": "https://www.booli.se/sok/till-salu?areaIds=1",
    "results_wanted": 50,
    "max_pages": 5
}
```

### Larger Run With A Proxy

Collect a bigger dataset with proxy settings for steadier runs:

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

```json
{
    "source": "booli.se",
    "booliId": 6309020,
    "listingId": "6309020",
    "objectId": 690329,
    "url": "https://www.booli.se/bostad/690329",
    "address": "Näsbydalsvägen 12",
    "locationText": "Lägenhet · Näsbydal · Täby",
    "objectType": "Lägenhet",
    "saleType": "succession",
    "listPrice": 2850000,
    "listPriceText": "2 850 000 kr",
    "rooms": 2,
    "livingArea": 62.5,
    "floor": "vån 10",
    "fee": 3955,
    "published": "Inkommet idag",
    "daysActive": 0,
    "latitude": 59.4382017,
    "longitude": 18.0656548,
    "municipality": "Täby",
    "county": "Stockholms län",
    "brokerName": "HusmanHagberg",
    "thumbnail": "https://bcdn.se/images/cache/57029360_640x0.jpg",
    "imageCount": 5,
    "amenities": ["Hiss", "Balkong"],
    "showing": "Sön 25 okt kl 12:00",
    "upcomingSale": false,
    "page": 1
}
```

## Tips for Best Results

- Put location, property type, and other filters directly into `startUrl`.
- Start with `results_wanted: 20` for a quick test, then increase it for full collection.
- Residential proxies are recommended for larger or repeated production runs.
- Newly added listings can appear more than once across pages; the Actor removes duplicates automatically.
- If you see fewer fields on some listings, the source simply does not publish that information for those items.

## Integrations

- **Google Sheets** - Export listing datasets for quick review.
- **Airtable** - Store searchable property records.
- **Make** - Trigger follow-up automations from fresh listings.
- **Zapier** - Send new dataset items into downstream tools.
- **Webhooks** - Push data into custom applications.
- **API** - Access datasets programmatically from your own systems.

### Export Formats

- **JSON** - For APIs and application pipelines.
- **CSV** - For spreadsheet and tabular analysis.
- **Excel** - For business reporting.
- **XML** - For external system imports.

## Frequently Asked Questions

### How many listings can I collect?

You can collect as many as the search results expose, bounded by your `results_wanted` and `max_pages` settings.

### Does the Actor handle pagination?

Yes. It moves through additional result pages until it reaches the requested listing limit or the page cap.

### Why are some fields missing on some items?

The Actor removes empty values, so a field only appears when Booli publishes it for that listing.

### Can I use filtered Booli searches?

Yes. Put your desired Booli filters, such as location or property type, directly into `startUrl`.

### Can I export the data to CSV or Excel?

Yes. Apify datasets can be downloaded in CSV, Excel, JSON, XML, and other supported formats.

### Can I run this Actor on a schedule?

Yes. You can schedule the Actor in Apify Console to refresh listings hourly, daily, weekly, or at another interval.

### Do I need proxies?

For reliable production runs, residential proxies are recommended. Small test runs can work without them.

### Is it legal to scrape Booli?

Scraping publicly available data can be legal, but you are responsible for complying with applicable laws, website terms, and privacy rules.

## Support

For issues, feature requests, or custom work, use the Issues tab on the Actor page or contact the developer through Apify.

## Legal Notice

This Actor is designed for legitimate data collection from publicly available sources. You are responsible for using the data responsibly and complying with applicable laws and website terms.
