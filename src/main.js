import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Actor, log } from 'apify';
import { Dataset } from 'crawlee';
import { chromium } from 'patchright';

const BASE_URL = 'https://www.booli.se';
const DEFAULT_START_URL = `${BASE_URL}/sok/till-salu`;
const IMAGE_CDN_TEMPLATE = 'https://bcdn.se/images/cache/{id}_640x0.jpg';

const CHALLENGE_PATTERN =
    /just a moment|attention required|v[äa]nta|checking your browser|cf-browser-verification|enable javascript and cookies/i;

const NAV_TIMEOUT_MS = 60000;
const READY_TIMEOUT_MS = 25000;
const READY_POLL_MS = 1500;
const MAX_NAV_ATTEMPTS = 2;
const MAX_SESSIONS = 4;

// Listing-hint keys used to recognize listing objects across payload versions
// (current App Router/Apollo shape and older Pages Router shape).
const LISTING_HINT_KEYS = [
    'listingId',
    'displayPrice',
    'subtitle',
    'objectType',
    'title',
    'position',
    'presenter',
    'images',
    'booliId',
    'listPrice',
    'streetAddress',
    'descriptiveAreaName',
    'livingArea',
    'rooms',
];

await Actor.init();

/* -------------------------------------------------------------------------- */
/* Generic helpers                                                            */
/* -------------------------------------------------------------------------- */

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function toPositiveInteger(value, fallback) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toAbsoluteUrl(value) {
    if (typeof value !== 'string' || value.trim() === '') return undefined;

    try {
        return new URL(value, BASE_URL).href;
    } catch {
        return undefined;
    }
}

function pruneEmpty(value) {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'number') return Number.isNaN(value) ? undefined : value;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed === '' ? undefined : trimmed;
    }
    if (Array.isArray(value)) {
        const cleaned = value.map((item) => pruneEmpty(item)).filter((item) => item !== undefined);
        return cleaned.length > 0 ? cleaned : undefined;
    }
    if (isPlainObject(value)) {
        const cleanedEntries = Object.entries(value)
            .map(([key, entryValue]) => [key, pruneEmpty(entryValue)])
            .filter(([, entryValue]) => entryValue !== undefined);

        return cleanedEntries.length > 0 ? Object.fromEntries(cleanedEntries) : undefined;
    }

    return value;
}

function parseLeadingNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value !== 'string') return undefined;

    let text = value.replace(/\s/g, '').replace(/[^\d.,-]/g, '');
    if (text === '') return undefined;

    const lastDot = text.lastIndexOf('.');
    const lastComma = text.lastIndexOf(',');

    if (lastDot > -1 && lastComma > -1) {
        if (lastComma > lastDot) {
            text = text.replace(/\./g, '').replace(',', '.');
        } else {
            text = text.replace(/,/g, '');
        }
    } else if (lastComma > -1) {
        const parts = text.split(',');
        text = parts.length === 2 && parts[1].length <= 2 ? `${parts[0]}.${parts[1]}` : text.replace(/,/g, '');
    }

    const parsed = Number.parseFloat(text);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDaysActive(value) {
    if (typeof value !== 'string') return undefined;

    const normalized = value.toLowerCase();
    if (normalized.includes('idag')) return 0;
    if (normalized.includes('igår') || normalized.includes('igar')) return 1;

    const match = normalized.match(/(\d+)\s*(dag|dagar|veck|månad|manad)/);
    if (!match) return undefined;

    const amount = Number.parseInt(match[1], 10);
    if (!Number.isFinite(amount)) return undefined;
    if (match[2].startsWith('veck')) return amount * 7;
    if (match[2].startsWith('månad') || match[2].startsWith('manad')) return amount * 30;
    return amount;
}

function pickString(...candidates) {
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim();
    }
    return undefined;
}

/* -------------------------------------------------------------------------- */
/* Input / proxy handling                                                     */
/* -------------------------------------------------------------------------- */

function collectStartUrls(input) {
    const urls = [];

    if (Array.isArray(input.startUrls)) {
        for (const entry of input.startUrls) {
            if (typeof entry === 'string') urls.push(entry);
            if (isPlainObject(entry) && typeof entry.url === 'string') urls.push(entry.url);
        }
    }

    if (typeof input.startUrl === 'string') urls.push(input.startUrl);
    if (typeof input.url === 'string') urls.push(input.url);

    return [...new Set(urls.map((url) => toAbsoluteUrl(url)).filter(Boolean))];
}

async function createProxyConfigurationSafely(proxyInput) {
    if (!isPlainObject(proxyInput)) return undefined;

    const hasCustomUrls = Array.isArray(proxyInput.proxyUrls) && proxyInput.proxyUrls.length > 0;
    const requestedApifyProxy =
        proxyInput.useApifyProxy === true ||
        (Array.isArray(proxyInput.apifyProxyGroups) && proxyInput.apifyProxyGroups.length > 0) ||
        (Array.isArray(proxyInput.groups) && proxyInput.groups.length > 0);

    if (!hasCustomUrls && !requestedApifyProxy) return undefined;

    try {
        return await Actor.createProxyConfiguration(proxyInput);
    } catch (error) {
        log.warning(`Proxy configuration could not be initialized: ${error.message}`);
        return undefined;
    }
}

function usesUnblockerGroup(proxyInput) {
    const groups = [
        ...(Array.isArray(proxyInput?.apifyProxyGroups) ? proxyInput.apifyProxyGroups : []),
        ...(Array.isArray(proxyInput?.groups) ? proxyInput.groups : []),
    ];
    return groups.some((group) => String(group).toUpperCase() === 'UNBLOCKER');
}

/* -------------------------------------------------------------------------- */
/* Browser session (Patchright + persistent context)                          */
/* -------------------------------------------------------------------------- */

function buildPageUrl(startUrl, pageNo) {
    const url = new URL(startUrl);
    if (pageNo > 1) {
        url.searchParams.set('page', String(pageNo));
    } else {
        url.searchParams.delete('page');
    }
    return url.href;
}

// Chromium rejects proxy credentials embedded in the server URL for some proxies,
// so split them into the dedicated Playwright proxy fields.
function toPlaywrightProxy(proxyUrl) {
    if (!proxyUrl) return undefined;

    try {
        const parsed = new URL(proxyUrl);
        const server = `${parsed.protocol}//${parsed.host}`;
        const username = parsed.username ? decodeURIComponent(parsed.username) : undefined;
        const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;

        return {
            server,
            ...(username ? { username } : {}),
            ...(password ? { password } : {}),
        };
    } catch {
        return { server: proxyUrl };
    }
}

async function launchPersistentBrowser(profileDir, proxyUrl) {
    const proxy = toPlaywrightProxy(proxyUrl);
    const baseOptions = {
        headless: false,
        noViewport: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
        ...(proxy ? { proxy } : {}),
    };

    try {
        return await chromium.launchPersistentContext(profileDir, { ...baseOptions, channel: 'chrome' });
    } catch (error) {
        log.warning(`Google Chrome channel unavailable, falling back to bundled Chromium: ${error.message}`);
        return chromium.launchPersistentContext(profileDir, baseOptions);
    }
}

async function createBrowserSession(proxyConfiguration, proxySessionId) {
    const proxyUrl = proxyConfiguration
        ? await proxyConfiguration.newUrl(proxySessionId).catch(() => undefined)
        : undefined;
    const profileDir = mkdtempSync(join(tmpdir(), 'booli-profile-'));

    let context;
    try {
        context = await launchPersistentBrowser(profileDir, proxyUrl);
    } catch (error) {
        rmSync(profileDir, { recursive: true, force: true });
        throw error;
    }

    const [existingPage] = context.pages();
    const page = existingPage ?? (await context.newPage());

    // Skip heavy/irrelevant assets to save proxy bandwidth. Scripts and the
    // Cloudflare challenge resources stay enabled.
    await page
        .route('**/*', (route) => {
            const request = route.request();
            const resourceType = request.resourceType();
            const url = request.url().toLowerCase();

            if (
                resourceType === 'image' ||
                resourceType === 'font' ||
                resourceType === 'media' ||
                url.includes('google-analytics') ||
                url.includes('googletagmanager') ||
                url.includes('doubleclick') ||
                url.includes('hotjar')
            ) {
                return route.abort();
            }

            return route.continue();
        })
        .catch(() => {});

    return {
        page,
        async close() {
            await context.close().catch(() => {});
            rmSync(profileDir, { recursive: true, force: true });
        },
    };
}

/* -------------------------------------------------------------------------- */
/* Page loading with Cloudflare-aware wait                                    */
/* -------------------------------------------------------------------------- */

async function readPageState(page) {
    return page
        .evaluate(() => {
            const scripts = Array.from(document.querySelectorAll('script'));
            const hasApolloTransport = scripts.some((script) =>
                (script.textContent || '').includes('ApolloSSRDataTransport'),
            );
            const hasNextData = Boolean(document.getElementById('__NEXT_DATA__'));
            const hasNextFlight = scripts.some((script) => (script.textContent || '').includes('__next_f'));
            const hasListingLinks = document.querySelector('a[href*="/bostad/"], a[href*="/annons/"]') !== null;
            return {
                title: document.title || '',
                ready: hasApolloTransport || hasNextData || hasListingLinks || (hasNextFlight && hasListingLinks),
            };
        })
        .catch(() => ({ title: '', ready: false }));
}

async function waitForListingData(page, crawlerLog) {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    let lastTitle = '';
    let challengeLogged = false;

    while (Date.now() < deadline) {
        const state = await readPageState(page);
        if (state.ready) return true;

        lastTitle = state.title || lastTitle;
        const challenged = CHALLENGE_PATTERN.test(state.title || '');
        if (challenged && crawlerLog && !challengeLogged) {
            crawlerLog.info('Cloudflare challenge detected, waiting for it to clear.');
            challengeLogged = true;
        }

        await sleep(READY_POLL_MS);
    }

    if (crawlerLog) crawlerLog.warning(`Listing data did not appear in time (title: "${lastTitle}").`);
    return false;
}

async function loadListingPage(session, pageUrl, crawlerLog) {
    let lastStatus;

    for (let attempt = 1; attempt <= MAX_NAV_ATTEMPTS; attempt += 1) {
        try {
            const response = await session.page.goto(pageUrl, {
                waitUntil: 'domcontentloaded',
                timeout: NAV_TIMEOUT_MS,
            });
            lastStatus = response ? response.status() : undefined;

            if (await waitForListingData(session.page, crawlerLog)) {
                return { loaded: true, status: lastStatus };
            }
        } catch (error) {
            crawlerLog.warning(
                `Navigation attempt ${attempt}/${MAX_NAV_ATTEMPTS} failed for ${pageUrl}: ${error.message}`,
            );
        }

        if (attempt < MAX_NAV_ATTEMPTS) {
            const backoff = attempt * 2000 + Math.floor(Math.random() * 1000);
            crawlerLog.warning(
                `Retrying ${pageUrl} in ${Math.round(backoff / 1000)}s (attempt ${attempt + 1}/${MAX_NAV_ATTEMPTS}).`,
            );
            await sleep(backoff);
        }
    }

    return { loaded: false, status: lastStatus };
}

/* -------------------------------------------------------------------------- */
/* Extraction (runs inside the browser)                                       */
/* -------------------------------------------------------------------------- */

function extractListingsInPage(hintPairs) {
    const hintKeys = hintPairs;

    function isObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }

    // The Apollo transport script is an inline object literal that may contain
    // `undefined` tokens; convert them to null so JSON.parse accepts it.
    function parseApolloTransport(text) {
        const pushIndex = text.indexOf('.push(');
        if (pushIndex === -1) return undefined;

        const objectText = text
            .slice(pushIndex + '.push('.length)
            .replace(/\)\s*;?\s*$/, '')
            .replace(/\bundefined\b/g, 'null');

        try {
            return JSON.parse(objectText);
        } catch {
            return undefined;
        }
    }

    function scoreArray(array) {
        let best = 0;
        for (const item of array.slice(0, 8)) {
            if (!isObject(item)) continue;
            const keys = Object.keys(item);
            let score = 0;
            for (const hint of hintKeys) {
                if (keys.includes(hint)) score += 1;
            }
            if (score > best) best = score;
        }
        return best;
    }

    function pathWeight(path) {
        if (/forSale/i.test(path)) return 100;
        if (/sold/i.test(path)) return -50;
        return 0;
    }

    function findListingArrays(root) {
        const seen = new Set();
        const queue = [{ value: root, path: '$' }];
        const candidates = [];

        while (queue.length > 0) {
            const { value, path } = queue.shift();
            if (!isObject(value) && !Array.isArray(value)) continue;
            if (seen.has(value)) continue;
            seen.add(value);

            if (Array.isArray(value)) {
                const objectItems = value.filter(isObject);
                if (objectItems.length > 0) {
                    const score = scoreArray(objectItems);
                    if (score >= 4)
                        candidates.push({ items: objectItems, path, score, weight: pathWeight(path) + score });
                }
                for (let index = 0; index < Math.min(value.length, 25); index += 1) {
                    queue.push({ value: value[index], path: `${path}[${index}]` });
                }
                continue;
            }

            for (const [key, nested] of Object.entries(value)) {
                queue.push({ value: nested, path: `${path}.${key}` });
            }
        }

        // Prefer the primary for-sale result set, then the best-scoring, largest array.
        candidates.sort((a, b) => b.weight - a.weight || b.items.length - a.items.length);
        return candidates[0];
    }

    function collectFromParsed(parsed) {
        if (!isObject(parsed)) return undefined;
        const rehydrate = parsed.rehydrate || parsed;
        return findListingArrays(rehydrate) || findListingArrays(parsed);
    }

    const scripts = Array.from(document.querySelectorAll('script')).map((script) => script.textContent || '');

    // 1. Current App Router + Apollo SSR data transport payload.
    const apolloScript = scripts.find((text) => text.includes('ApolloSSRDataTransport'));
    if (apolloScript) {
        const parsed = parseApolloTransport(apolloScript);
        const found = parsed ? collectFromParsed(parsed) : undefined;
        if (found && found.items.length > 0) {
            return { source: 'apollo', path: found.path, items: found.items };
        }
    }

    // 2. Legacy Pages Router payload, kept for backward compatibility.
    const nextDataElement = document.getElementById('__NEXT_DATA__');
    if (nextDataElement && nextDataElement.textContent) {
        try {
            const parsed = JSON.parse(nextDataElement.textContent);
            const found = collectFromParsed(parsed);
            if (found && found.items.length > 0) {
                return { source: 'next-data', path: found.path, items: found.items };
            }
        } catch {
            // Ignore malformed legacy payloads and continue with the DOM fallback.
        }
    }

    // 3. Rendered DOM fallback: at least preserve listing URLs and titles.
    const anchors = Array.from(document.querySelectorAll('a[href*="/bostad/"], a[href*="/annons/"]'));
    const domItems = [];
    const seenHrefs = new Set();
    for (const anchor of anchors) {
        const href = anchor.getAttribute('href');
        if (!href || seenHrefs.has(href)) continue;
        seenHrefs.add(href);
        const name = (anchor.querySelector('h2,h3,[class*="title"],[class*="Title"]')?.textContent || '').trim();
        domItems.push({ url: href, title: name || undefined });
    }

    if (domItems.length > 0) {
        return { source: 'dom', path: 'dom', items: domItems };
    }

    return { source: null, path: null, items: [] };
}

async function extractListingItems(page) {
    return page.evaluate(extractListingsInPage, LISTING_HINT_KEYS);
}

/* -------------------------------------------------------------------------- */
/* Normalization                                                              */
/* -------------------------------------------------------------------------- */

function buildDataPointMap(raw) {
    const byKey = new Map();
    const entries = [];
    const dataPoints = raw?.displayAttributes?.dataPoints;
    if (!Array.isArray(dataPoints)) return { byKey, entries };

    for (const entry of dataPoints) {
        if (!isPlainObject(entry)) continue;
        const { value } = entry;
        const text = pickString(
            value?.plainText,
            value?.markdown,
            value?.raw,
            typeof value === 'string' ? value : undefined,
            entry.screenReaderLabel,
        );
        if (!text) continue;

        if (typeof entry.key === 'string' && !byKey.has(entry.key)) byKey.set(entry.key, text);
        entries.push({ key: entry.key, label: entry.label, text });
    }

    return { byKey, entries };
}

// The `rentOrPlotAreaText` key is reused for both fees and plot areas depending
// on the listing, so resolve it by the human-readable label first.
function findDataPointText(map, keys, labelPattern) {
    if (labelPattern) {
        const match = map.entries.find((entry) => typeof entry.label === 'string' && labelPattern.test(entry.label));
        if (match) return match.text;
    }

    for (const key of keys) {
        if (map.byKey.has(key)) return map.byKey.get(key);
    }

    return undefined;
}

function extractAmenityLabels(amenities) {
    if (!Array.isArray(amenities)) return undefined;

    const labels = amenities
        .map((entry) => {
            if (typeof entry === 'string') return entry.trim() || undefined;
            if (!isPlainObject(entry)) return undefined;
            return pickString(entry.label, entry.name, entry.key);
        })
        .filter(Boolean);

    return labels.length > 0 ? labels : undefined;
}

function extractImageUrl(raw) {
    const firstImage = Array.isArray(raw.images) ? raw.images.find(isPlainObject) : undefined;
    const imageId = firstImage?.id ?? raw.primaryImage?.id ?? raw.image?.id ?? raw.primaryImageId;
    if (imageId !== undefined && imageId !== null && String(imageId).trim() !== '') {
        return IMAGE_CDN_TEMPLATE.replace('{id}', String(imageId));
    }

    const direct = pickString(raw.thumbnail, raw.thumbnailUrl, raw.imageUrl, raw.coverImage);
    return toAbsoluteUrl(direct);
}

function normalizeListing(raw, meta) {
    if (!isPlainObject(raw)) return undefined;

    const cleaned = pruneEmpty(raw);
    if (!isPlainObject(cleaned)) return undefined;

    const props = isPlainObject(raw.tracking?.properties) ? raw.tracking.properties : {};
    const dataPoints = buildDataPointMap(raw);
    const listingIdRaw = raw.listingId ?? props.booli_id ?? raw.booliId ?? raw.id ?? raw.objectId;
    const booliId = Number.parseInt(String(listingIdRaw ?? ''), 10);
    const url = toAbsoluteUrl(raw.url ?? raw.link ?? raw.href ?? props.url);
    const objectIdMatch = typeof url === 'string' ? url.match(/\/(?:bostad|annons)\/(\d+)/) : undefined;

    const normalized = pruneEmpty({
        source: 'booli.se',
        booliId: Number.isFinite(booliId) ? booliId : undefined,
        listingId: raw.listingId,
        objectId: objectIdMatch ? Number.parseInt(objectIdMatch[1], 10) : undefined,
        url,
        address: pickString(raw.title, raw.address, raw.streetAddress, raw.street),
        locationText: pickString(raw.subtitle, raw.locationText, raw.displayAttributes?.screenReaderLabel),
        objectType: pickString(raw.objectType, raw.objectSubType, raw.type),
        saleType: raw.saleType,
        tenureForm: raw.tenureForm,
        listPrice:
            parseLeadingNumber(raw.displayPrice) ??
            parseLeadingNumber(raw.listPrice?.value ?? raw.listPrice?.raw) ??
            parseLeadingNumber(raw.listPrice ?? raw.askingPrice ?? raw.price),
        listPriceText: pickString(raw.displayPrice),
        listSqmPrice:
            parseLeadingNumber(findDataPointText(dataPoints, ['listSqmPrice'])) ?? parseLeadingNumber(raw.listSqmPrice),
        rooms:
            parseLeadingNumber(findDataPointText(dataPoints, ['rooms', 'room'])) ??
            parseLeadingNumber(raw.rooms?.formatted ?? raw.rooms),
        livingArea:
            parseLeadingNumber(findDataPointText(dataPoints, ['livingArea', 'areaLiving'])) ??
            parseLeadingNumber(raw.livingArea?.formatted ?? raw.livingArea),
        plotArea:
            parseLeadingNumber(findDataPointText(dataPoints, ['plotArea'], /tomt/i)) ??
            parseLeadingNumber(raw.plotArea?.formatted ?? raw.plotArea),
        floor:
            findDataPointText(dataPoints, ['floor']) ??
            pickString(raw.floor?.formatted, typeof raw.floor === 'string' ? raw.floor : undefined),
        fee:
            parseLeadingNumber(findDataPointText(dataPoints, ['fee'], /avgift/i)) ??
            parseLeadingNumber(raw.fee?.raw ?? raw.fee),
        rent:
            parseLeadingNumber(findDataPointText(dataPoints, ['rent'])) ??
            parseLeadingNumber(raw.rent?.raw ?? raw.rent),
        published: pickString(raw.displayDate, raw.published, raw.publishedDate, raw.addedAt),
        daysActive: parseDaysActive(raw.displayDate) ?? parseLeadingNumber(raw.daysActive),
        latitude: raw.position?.latitude ?? raw.latitude ?? raw.coordinates?.lat,
        longitude: raw.position?.longitude ?? raw.longitude ?? raw.coordinates?.lng ?? raw.coordinates?.lon,
        municipality: pickString(props.municipality, raw.location?.region?.municipalityName, raw.municipalityName),
        county: pickString(props.county),
        brokerName: pickString(raw.presenter?.name, raw.brokerName, raw.broker?.name),
        thumbnail: extractImageUrl(raw),
        imageCount: Array.isArray(raw.images) ? raw.images.length : undefined,
        amenities: extractAmenityLabels(raw.amenities),
        showing: pickString(raw.secondaryStatus?.label, raw.nextShowing?.startTime),
        upcomingSale: typeof props.upcoming_sale === 'boolean' ? props.upcoming_sale : raw.upcomingSale,
        isNewConstruction: raw.isNewConstruction,
        searchUrl: meta.searchUrl,
        pageUrl: meta.pageUrl,
        page: meta.pageNo,
    });

    return isPlainObject(normalized) ? normalized : undefined;
}

function getListingIdentity(item) {
    const direct = [item.booliId, item.listingId, item.objectId, item.url]
        .map((value) => (value === null || value === undefined ? '' : String(value).trim()))
        .find((value) => value !== '');

    if (direct) return direct;
    return `${item.address ?? ''}|${item.locationText ?? ''}|${item.listPrice ?? ''}`;
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

async function runSearch(startUrl, options) {
    const { resultsWanted, maxPages, seenListings, proxyConfiguration, stickyProxySessions, crawlerLog } = options;

    let savedCount = 0;
    let proxySessionId = `booli${Date.now()}${Math.floor(Math.random() * 100000)}`;

    for (let sessionAttempt = 1; sessionAttempt <= MAX_SESSIONS && savedCount < resultsWanted; sessionAttempt += 1) {
        let session;
        try {
            crawlerLog.info(`Starting browser session ${sessionAttempt} for ${startUrl}`);
            session = await createBrowserSession(proxyConfiguration, stickyProxySessions ? proxySessionId : undefined);

            for (let pageNo = 1; pageNo <= maxPages && savedCount < resultsWanted; pageNo += 1) {
                const pageUrl = buildPageUrl(startUrl, pageNo);
                const { loaded } = await loadListingPage(session, pageUrl, crawlerLog);

                if (!loaded) {
                    crawlerLog.warning(`Skipping page ${pageNo}, listing data not available.`);
                    if (pageNo === 1) break;
                    continue;
                }

                let extraction;
                try {
                    extraction = await extractListingItems(session.page);
                } catch (error) {
                    crawlerLog.warning(`Extraction failed on page ${pageNo}: ${error.message}`);
                    continue;
                }

                const batch = [];
                for (const rawItem of extraction.items) {
                    const normalized = normalizeListing(rawItem, {
                        searchUrl: startUrl,
                        pageUrl,
                        pageNo,
                    });
                    if (!normalized) continue;

                    const identity = String(getListingIdentity(normalized));
                    if (!identity || seenListings.has(identity)) continue;

                    seenListings.add(identity);
                    batch.push(normalized);

                    if (savedCount + batch.length >= resultsWanted) break;
                }

                if (batch.length > 0) {
                    await Dataset.pushData(batch);
                    savedCount += batch.length;
                }

                crawlerLog.info(
                    `Page ${pageNo}: source=${extraction.source ?? 'none'} detected=${extraction.items.length} saved=${batch.length} total=${savedCount}/${resultsWanted}`,
                );

                if (extraction.items.length === 0 && pageNo > 1) break;
            }

            // Success when we collected data for this search.
            if (savedCount > 0) break;

            crawlerLog.warning(`No listings collected in session ${sessionAttempt}; rotating session.`);
        } catch (error) {
            crawlerLog.warning(`Session ${sessionAttempt} failed for ${startUrl}: ${error.message}`);
        } finally {
            if (session) await session.close();
        }

        proxySessionId = `booli${Date.now()}${Math.floor(Math.random() * 100000)}`;
    }
    return savedCount;
}

async function main() {
    const input = (await Actor.getInput()) || {};
    const resultsWanted = toPositiveInteger(input.results_wanted, 20);
    const maxPages = toPositiveInteger(input.max_pages, 3);
    const startUrls = collectStartUrls(input);
    const proxyConfiguration = await createProxyConfigurationSafely(input.proxyConfiguration);

    if (proxyConfiguration && usesUnblockerGroup(input.proxyConfiguration)) {
        log.info('Unblocker proxy group detected; a single request session is used without sticky session IDs.');
    }

    const effectiveStartUrls = startUrls.length > 0 ? startUrls : [DEFAULT_START_URL];
    const stickyProxySessions = !usesUnblockerGroup(input.proxyConfiguration);
    const seenListings = new Set();
    let totalSaved = 0;

    log.info(`Starting run | target=${resultsWanted} | max_pages=${maxPages} | searches=${effectiveStartUrls.length}`);

    for (const startUrl of effectiveStartUrls) {
        if (totalSaved >= resultsWanted) break;

        const remaining = resultsWanted - totalSaved;
        const saved = await runSearch(startUrl, {
            resultsWanted: remaining,
            maxPages,
            seenListings,
            proxyConfiguration,
            stickyProxySessions,
            crawlerLog: log,
        });
        totalSaved += saved;
    }

    if (totalSaved === 0) {
        throw new Error(
            `No listings were collected for ${effectiveStartUrls.length} search(es). ` +
                'This usually means the page was blocked or the source layout changed.',
        );
    }

    log.info(`Extraction complete | saved=${totalSaved} | searches=${effectiveStartUrls.length}`);
    return totalSaved;
}

let exitCode = 0;

main()
    .catch((error) => {
        log.exception(error, 'Actor run failed');
        exitCode = 1;
    })
    .finally(async () => {
        await Actor.exit({ exitCode });
    });
