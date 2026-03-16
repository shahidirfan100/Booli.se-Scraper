import { Actor, log } from 'apify';
import { launchOptions as camoufoxLaunchOptions } from 'camoufox-js';
import { Dataset, PlaywrightCrawler } from 'crawlee';
import { firefox } from 'playwright';

const DEFAULT_START_URL = 'https://www.booli.se/sok/till-salu';
const BASE_URL = 'https://www.booli.se';
const URLSCAN_SEARCH_ENDPOINT = 'https://urlscan.io/api/v1/search/?q=';
const URLSCAN_RESULT_ENDPOINT = 'https://urlscan.io/api/v1/result/';
const URLSCAN_RESPONSE_ENDPOINT = 'https://urlscan.io/responses/';
const LISTING_HINT_KEYS = [
    'booliId',
    'objectType',
    'listPrice',
    'rent',
    'fee',
    'rooms',
    'livingArea',
    'plotArea',
    'floor',
    'daysActive',
    'published',
    'constructionYear',
    'latitude',
    'longitude',
    'broker',
    'images',
    'url',
];

await Actor.init();

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
        const cleaned = value.map(pruneEmpty).filter((item) => item !== undefined);
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

function normalizeLocationText(item) {
    const candidates = new Set();
    const push = (value) => {
        const normalized = pruneEmpty(value);
        if (typeof normalized === 'string') candidates.add(normalized);
    };

    push(item.locationText);
    push(item.address);
    push(item.streetAddress);
    push(item.city);
    push(item.areaName);
    push(item.municipalityName);
    push(item.region);

    if (isPlainObject(item.location)) {
        push(item.location.name);
        push(item.location.label);
        push(item.location.city);
        push(item.location.region);
    } else {
        push(item.location);
    }

    if (Array.isArray(item.namedAreas)) {
        for (const area of item.namedAreas) {
            if (isPlainObject(area)) push(area.name);
            else push(area);
        }
    }

    return [...candidates].join(', ') || undefined;
}

function extractImageUrl(item) {
    const candidates = [
        item.thumbnail,
        item.thumbnailUrl,
        item.image,
        item.imageUrl,
        item.coverImage,
    ];

    if (Array.isArray(item.images)) {
        for (const image of item.images) {
            if (typeof image === 'string') candidates.push(image);
            if (isPlainObject(image)) candidates.push(image.url, image.src, image.imageUrl);
        }
    }

    if (Array.isArray(item.photos)) {
        for (const image of item.photos) {
            if (typeof image === 'string') candidates.push(image);
            if (isPlainObject(image)) candidates.push(image.url, image.src, image.imageUrl);
        }
    }

    return candidates.map(toAbsoluteUrl).find(Boolean);
}

function scoreListingObject(item) {
    if (!isPlainObject(item)) return 0;

    const keys = new Set(Object.keys(item));
    let score = 0;

    for (const key of LISTING_HINT_KEYS) {
        if (keys.has(key)) score += 3;
    }

    if ([...keys].some((key) => /price|area|room|broker|image|lat|lon|address/i.test(key))) score += 2;
    if (keys.size >= 8) score += 2;

    return score;
}

function findBestListingArray(root) {
    const seen = new Set();
    const queue = [{ value: root, path: '$' }];
    let best = { items: [], path: '$', score: 0 };

    while (queue.length > 0) {
        const current = queue.shift();
        const { value, path } = current;

        if (!value || typeof value !== 'object') continue;
        if (seen.has(value)) continue;
        seen.add(value);

        if (Array.isArray(value)) {
            const objectItems = value.filter((item) => isPlainObject(item));

            if (objectItems.length > 0) {
                const itemScores = objectItems.slice(0, 10).map(scoreListingObject);
                const maxScore = Math.max(...itemScores);
                const candidateScore = maxScore * 10 + Math.min(objectItems.length, 50);

                if (maxScore >= 6 && candidateScore > best.score) {
                    best = {
                        items: objectItems,
                        path,
                        score: candidateScore,
                    };
                }
            }

            for (let index = 0; index < Math.min(value.length, 20); index += 1) {
                queue.push({ value: value[index], path: `${path}[${index}]` });
            }

            continue;
        }

        for (const [key, nestedValue] of Object.entries(value)) {
            queue.push({ value: nestedValue, path: `${path}.${key}` });
        }
    }

    return best;
}

function getNextDataPageProps(nextData) {
    if (isPlainObject(nextData?.props?.pageProps)) return nextData.props.pageProps;
    if (isPlainObject(nextData?.pageProps)) return nextData.pageProps;
    return undefined;
}

function resolveApolloValue(value, apolloState, activeRefs = new Set()) {
    if (value === null || value === undefined) return undefined;

    if (Array.isArray(value)) {
        const resolved = value
            .map((entry) => resolveApolloValue(entry, apolloState, activeRefs))
            .filter((entry) => entry !== undefined);

        return resolved.length > 0 ? resolved : undefined;
    }

    if (!isPlainObject(value)) return value;

    if (typeof value.__ref === 'string') {
        const refKey = value.__ref;
        if (activeRefs.has(refKey)) return undefined;

        const refValue = apolloState?.[refKey];
        if (!isPlainObject(refValue)) return undefined;

        activeRefs.add(refKey);
        const resolvedRef = resolveApolloValue(refValue, apolloState, activeRefs);
        activeRefs.delete(refKey);
        return resolvedRef;
    }

    const cleanedEntries = Object.entries(value)
        .filter(([key]) => key !== '__typename')
        .map(([key, entryValue]) => [key, resolveApolloValue(entryValue, apolloState, activeRefs)])
        .filter(([, entryValue]) => entryValue !== undefined);

    return cleanedEntries.length > 0 ? Object.fromEntries(cleanedEntries) : undefined;
}

function extractListingsFromApolloState(nextData) {
    const pageProps = getNextDataPageProps(nextData);
    const apolloState = pageProps?.__APOLLO_STATE__;
    const rootQuery = apolloState?.ROOT_QUERY;

    if (!isPlainObject(apolloState) || !isPlainObject(rootQuery)) {
        return { items: [], path: '$.__APOLLO_STATE__.ROOT_QUERY' };
    }

    const searchEntries = Object.entries(rootQuery).filter(([key, value]) => (
        key.startsWith('searchForSale(')
        && isPlainObject(value)
        && Array.isArray(value.result)
    ));

    const listingItems = [];
    const seenRefs = new Set();
    let listingPath = '$.__APOLLO_STATE__.ROOT_QUERY';

    for (const [key, searchNode] of searchEntries) {
        listingPath = `$.__APOLLO_STATE__.ROOT_QUERY.${key}.result`;
        for (const listingRef of searchNode.result) {
            const refKey = isPlainObject(listingRef) && typeof listingRef.__ref === 'string'
                ? listingRef.__ref
                : undefined;

            if (!refKey || seenRefs.has(refKey)) continue;
            seenRefs.add(refKey);

            const resolvedListing = resolveApolloValue({ __ref: refKey }, apolloState);
            if (isPlainObject(resolvedListing)) listingItems.push(resolvedListing);
        }
    }

    return {
        items: listingItems,
        path: listingPath,
    };
}

function extractListingItemsFromNextData(nextData) {
    const apolloCandidate = extractListingsFromApolloState(nextData);
    if (apolloCandidate.items.length > 0) return apolloCandidate;

    const pageProps = getNextDataPageProps(nextData);
    const pagePropsCandidate = pageProps ? findBestListingArray(pageProps) : { items: [] };
    if (pagePropsCandidate.items.length > 0) return pagePropsCandidate;

    return findBestListingArray(nextData);
}

function extractScalar(value, preferredKeys = ['raw', 'value', 'formatted', 'label', 'name', 'startTime', 'id']) {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string') return pruneEmpty(value);
    if (typeof value === 'number' || typeof value === 'boolean') return value;

    if (Array.isArray(value)) {
        const cleaned = value
            .map((entry) => extractScalar(entry, preferredKeys))
            .filter((entry) => entry !== undefined);
        return cleaned.length > 0 ? cleaned : undefined;
    }

    if (!isPlainObject(value)) return undefined;

    for (const key of preferredKeys) {
        if (Object.hasOwn(value, key)) {
            const extracted = extractScalar(value[key], preferredKeys);
            if (extracted !== undefined) return extracted;
        }
    }

    return undefined;
}

function extractAmenityLabels(amenities) {
    if (!Array.isArray(amenities)) return undefined;

    const labels = amenities
        .map((entry) => {
            if (typeof entry === 'string') return pruneEmpty(entry);
            if (!isPlainObject(entry)) return undefined;
            return pruneEmpty(entry.label ?? entry.key ?? entry.name);
        })
        .filter((entry) => typeof entry === 'string' && entry !== '');

    return labels.length > 0 ? labels : undefined;
}

function normalizeListing(rawItem, meta) {
    const cleaned = pruneEmpty(rawItem);
    if (!isPlainObject(cleaned)) return undefined;

    const withoutTypename = Object.fromEntries(
        Object.entries(cleaned).filter(([key]) => key !== '__typename'),
    );

    const absoluteUrl = toAbsoluteUrl(withoutTypename.url ?? withoutTypename.objectUrl ?? withoutTypename.href ?? withoutTypename.link);
    const normalized = pruneEmpty({
        source: 'booli.se',
        booliId: withoutTypename.booliId ?? withoutTypename.id ?? withoutTypename.objectId,
        id: withoutTypename.id,
        url: absoluteUrl ?? withoutTypename.url,
        booliUrl: withoutTypename.booliUrl,
        name: withoutTypename.name,
        address: withoutTypename.address ?? withoutTypename.streetAddress ?? withoutTypename.street,
        streetAddress: withoutTypename.streetAddress,
        locationText: normalizeLocationText(withoutTypename),
        descriptiveAreaName: withoutTypename.descriptiveAreaName,
        municipalityName: withoutTypename.location?.region?.municipalityName ?? withoutTypename.municipalityName,
        namedAreas: withoutTypename.location?.namedAreas ?? withoutTypename.namedAreas,
        objectType: withoutTypename.objectType ?? withoutTypename.objectSubType ?? withoutTypename.type,
        tenureForm: withoutTypename.tenureForm,
        tenure: withoutTypename.tenure,
        tenurePlural: withoutTypename.tenurePlural,
        listPrice: extractScalar(withoutTypename.listPrice ?? withoutTypename.askingPrice ?? withoutTypename.price),
        listSqmPrice: extractScalar(withoutTypename.listSqmPrice),
        lowestProjectListPrice: extractScalar(withoutTypename.lowestProjectListPrice),
        listPriceRange: withoutTypename.listPriceRange,
        rent: extractScalar(withoutTypename.rent),
        fee: extractScalar(withoutTypename.fee),
        operatingCost: extractScalar(withoutTypename.operatingCost),
        mortgageDeed: extractScalar(withoutTypename.mortgageDeed),
        estimatePrice: extractScalar(withoutTypename.estimate?.price),
        rooms: extractScalar(withoutTypename.rooms),
        roomsList: withoutTypename.roomsList,
        livingArea: extractScalar(withoutTypename.livingArea ?? withoutTypename.area ?? withoutTypename.areaLiving),
        livingAreaRange: withoutTypename.livingAreaRange,
        plotArea: extractScalar(withoutTypename.plotArea ?? withoutTypename.landArea),
        floor: extractScalar(withoutTypename.floor),
        numberOfUnits: extractScalar(withoutTypename.numberOfUnits),
        published: withoutTypename.published ?? withoutTypename.publishedDate ?? withoutTypename.addedAt,
        created: withoutTypename.created,
        maxPublishedBoosted: withoutTypename.maxPublishedBoosted,
        daysActive: extractScalar(withoutTypename.daysActive),
        occupancy: withoutTypename.occupancy,
        isNewConstruction: withoutTypename.isNewConstruction,
        upcomingSale: withoutTypename.upcomingSale,
        biddingOpen: withoutTypename.biddingOpen,
        blockedImages: withoutTypename.blockedImages,
        featured: withoutTypename.featured,
        latitude: withoutTypename.latitude ?? withoutTypename.position?.lat ?? withoutTypename.coordinates?.lat,
        longitude: withoutTypename.longitude ?? withoutTypename.position?.lng ?? withoutTypename.position?.lon ?? withoutTypename.coordinates?.lng ?? withoutTypename.coordinates?.lon,
        thumbnail: extractImageUrl(withoutTypename),
        primaryImageId: extractScalar(withoutTypename.primaryImage?.id),
        primaryImageBlurhash: withoutTypename.primaryImage?.blurhash,
        imageId: extractScalar(withoutTypename.image?.id),
        brokerName: withoutTypename.brokerName ?? withoutTypename.broker?.name,
        developerName: withoutTypename.developer?.name,
        developerId: extractScalar(withoutTypename.developer?.id),
        amenities: extractAmenityLabels(withoutTypename.amenities),
        nextShowing: extractScalar(withoutTypename.nextShowing),
        searchUrl: meta.searchUrl,
        pageUrl: meta.pageUrl,
        page: meta.pageNo,
    });

    return isPlainObject(normalized) ? normalized : undefined;
}

function getListingIdentity(item) {
    const directIdentity = [item.booliId, item.id, item.objectId, item.url]
        .map((value) => (value === null || value === undefined ? '' : String(value).trim()))
        .find((value) => value !== '');

    if (directIdentity) return directIdentity;
    return `${item.address ?? ''}|${item.locationText ?? ''}|${item.listPrice ?? ''}`;
}

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

    return [...new Set(urls.map(toAbsoluteUrl).filter(Boolean))];
}

async function createProxyConfigurationSafely(proxyInput) {
    if (!proxyInput) return undefined;

    try {
        return await Actor.createProxyConfiguration(proxyInput);
    } catch (error) {
        log.warning(`Proxy configuration could not be initialized locally: ${error.message}`);
        return undefined;
    }
}

async function fetchJsonWithTimeout(url, timeoutMillis = 30000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMillis);

    try {
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
            },
            signal: controller.signal,
        });

        if (!response.ok) return undefined;
        return await response.json();
    } catch {
        return undefined;
    } finally {
        clearTimeout(timeout);
    }
}

function buildUrlScanQueries(pageUrl) {
    const normalized = toAbsoluteUrl(pageUrl);
    if (!normalized) return [];

    const queries = [`page.url:"${normalized}"`];

    try {
        const parsed = new URL(normalized);
        const withoutQuery = `${parsed.origin}${parsed.pathname}`;
        if (withoutQuery !== normalized) queries.push(`page.url:"${withoutQuery}"`);
    } catch {
        // Ignore URL parsing errors.
    }

    return [...new Set(queries)];
}

function findBestUrlScanNextDataRequest(scanResult, pageNo) {
    const requests = scanResult?.data?.requests;
    if (!Array.isArray(requests)) return undefined;

    const candidates = requests
        .map((entry) => {
            const requestUrl = entry?.request?.request?.url;
            const hash = entry?.response?.hash;
            const size = entry?.response?.size ?? 0;

            if (
                typeof requestUrl !== 'string'
                || typeof hash !== 'string'
                || !requestUrl.includes('/_next/data/')
                || !requestUrl.includes('/sok/')
            ) {
                return undefined;
            }

            const pageMatchBoost = requestUrl.includes(`page=${pageNo}`) ? 1000000 : 0;
            const saleBoost = requestUrl.includes('/till-salu') ? 10000 : 0;

            return {
                requestUrl,
                hash,
                score: pageMatchBoost + saleBoost + size,
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);

    return candidates[0];
}

async function getFallbackNextDataFromUrlScan(pageUrl, pageNo, crawlerLog) {
    const queries = buildUrlScanQueries(pageUrl);
    if (queries.length === 0) return undefined;

    for (const query of queries) {
        const searchUrl = `${URLSCAN_SEARCH_ENDPOINT}${encodeURIComponent(query)}`;
        const searchData = await fetchJsonWithTimeout(searchUrl, 30000);
        const scanResult = Array.isArray(searchData?.results) ? searchData.results[0] : undefined;
        const scanId = scanResult?.task?.uuid;
        if (!scanId) continue;

        const detailedScan = await fetchJsonWithTimeout(`${URLSCAN_RESULT_ENDPOINT}${scanId}/`, 30000);
        if (!detailedScan) continue;

        const nextDataRequest = findBestUrlScanNextDataRequest(detailedScan, pageNo);
        if (!nextDataRequest) continue;

        const snapshotResponse = await fetch(`${URLSCAN_RESPONSE_ENDPOINT}${nextDataRequest.hash}/`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
            },
        }).catch(() => undefined);

        if (!snapshotResponse?.ok) continue;

        const snapshotText = await snapshotResponse.text().catch(() => '');
        if (!snapshotText) continue;

        try {
            const parsed = JSON.parse(snapshotText);
            crawlerLog.warning(`Using URLScan fallback snapshot from scan ${scanId} for ${pageUrl}`);
            return parsed;
        } catch {
            // Keep trying next query.
        }
    }

    return undefined;
}

async function extractNextData(page) {
    const text = await page.locator('script#__NEXT_DATA__').first().textContent({ timeout: 5000 }).catch(() => null);
    if (text) {
        try {
            return JSON.parse(text);
        } catch (error) {
            log.warning(`Failed to parse __NEXT_DATA__: ${error.message}`);
        }
    }

    try {
        const browserValue = await page.evaluate(() => window.__NEXT_DATA__ ?? null);
        if (isPlainObject(browserValue)) return browserValue;
    } catch {
        // Ignore and continue with script-tag fallback.
    }

    const scriptPayloads = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script[type="application/json"]'));
        return scripts
            .map((script) => script.textContent || '')
            .filter((entry) => entry.includes('pageProps') || entry.includes('__APOLLO_STATE__'))
            .slice(0, 5);
    }).catch(() => []);

    for (const payload of scriptPayloads) {
        try {
            const parsed = JSON.parse(payload);
            if (isPlainObject(parsed)) return parsed;
        } catch {
            // Continue to next candidate.
        }
    }

    return undefined;
}

async function waitForNextDataPayload(page, crawlerLog) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
        const nextData = await extractNextData(page);
        if (nextData) return nextData;

        const title = await page.title().catch(() => '');
        const isChallengePage = /just a moment|attention required|v[äa]nta/i.test(title);
        if (!isChallengePage || attempt === 2) break;

        crawlerLog.warning(`Cloudflare challenge detected (attempt ${attempt}/2). Waiting and retrying.`);
        await page.waitForTimeout(5000 * attempt);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    }

    return undefined;
}

async function findNextPageUrl(page, currentUrl, pageNo) {
    const domNextUrl = await page
        .evaluate(() => {
            const normalize = (value) =>
                (value || '')
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase();

            const directMatch = document.querySelector('a[rel="next"]');
            if (directMatch instanceof HTMLAnchorElement && directMatch.href) return directMatch.href;

            const anchors = Array.from(document.querySelectorAll('a[href]'));
            for (const anchor of anchors) {
                const label = normalize([
                    anchor.textContent,
                    anchor.getAttribute('aria-label'),
                    anchor.getAttribute('title'),
                ].filter(Boolean).join(' '));

                if (/\b(next|nasta)\b/.test(label)) return anchor.href;
            }

            return null;
        })
        .catch(() => null);

    if (domNextUrl && domNextUrl !== currentUrl) return domNextUrl;

    const fallbackUrl = new URL(currentUrl);
    fallbackUrl.searchParams.set('page', String(pageNo + 1));
    return fallbackUrl.href === currentUrl ? undefined : fallbackUrl.href;
}

async function main() {
    const input = (await Actor.getInput()) || {};
    const {
        results_wanted: resultsWantedInput = 20,
        max_pages: maxPagesInput = 5,
        proxyConfiguration: proxyInput,
    } = input;

    const resultsWanted = toPositiveInteger(resultsWantedInput, 20);
    const maxPages = toPositiveInteger(maxPagesInput, 5);
    const startUrls = collectStartUrls(input);
    const proxyConfiguration = await createProxyConfigurationSafely(proxyInput);
    const useProxyForBrowser = Boolean(proxyConfiguration) && !Actor.isAtHome();
    if (proxyConfiguration && !useProxyForBrowser) {
        log.warning('Proxy configuration supplied, but proxy is disabled in Apify cloud run for stability.');
    }

    const effectiveProxyConfiguration = useProxyForBrowser ? proxyConfiguration : undefined;
    const camoufoxProxyUrl = effectiveProxyConfiguration
        ? await effectiveProxyConfiguration.newUrl().catch(() => undefined)
        : undefined;
    let launchOptions = {
        headless: true,
        firefoxUserPrefs: {
            'intl.accept_languages': 'sv-SE,sv,en-US,en',
        },
    };

    try {
        launchOptions = await camoufoxLaunchOptions({
            headless: true,
            ...(camoufoxProxyUrl ? { proxy: camoufoxProxyUrl, geoip: true } : {}),
        });
        launchOptions.firefoxUserPrefs = {
            ...(launchOptions.firefoxUserPrefs || {}),
            'intl.accept_languages': 'sv-SE,sv,en-US,en',
        };
    } catch (error) {
        log.warning(`Camoufox options unavailable, using default Firefox launch options: ${error.message}`);
    }

    const seenListings = new Set();
    let savedCount = 0;

    const crawler = new PlaywrightCrawler({
        launchContext: {
            launcher: firefox,
            launchOptions,
        },
        proxyConfiguration: effectiveProxyConfiguration,
        useSessionPool: true,
        sessionPoolOptions: {
            blockedStatusCodes: [],
        },
        maxConcurrency: 5,
        maxRequestRetries: 1,
        navigationTimeoutSecs: 45,
        requestHandlerTimeoutSecs: 120,
        preNavigationHooks: [
            async ({ page }) => {
                await page.context().setExtraHTTPHeaders({
                    'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.8',
                    Referer: BASE_URL,
                });

                await page.route('**/*', (route) => {
                    const request = route.request();
                    const resourceType = request.resourceType();
                    const url = request.url().toLowerCase();

                    if (
                        ['image', 'font', 'media', 'stylesheet'].includes(resourceType)
                        || url.includes('google-analytics')
                        || url.includes('googletagmanager')
                        || url.includes('doubleclick')
                        || url.includes('facebook')
                        || url.includes('hotjar')
                    ) {
                        return route.abort();
                    }

                    return route.continue();
                });
            },
        ],
        postNavigationHooks: [
            async ({ handleCloudflareChallenge }) => {
                await handleCloudflareChallenge({
                    verbose: true,
                    sleepSecs: 25,
                    preChallengeSleepSecs: 3,
                });
            },
        ],
        async requestHandler({ page, request, enqueueLinks, log: crawlerLog }) {
            if (savedCount >= resultsWanted) return;

            const pageNo = toPositiveInteger(request.userData?.pageNo, 1);
            const rootSearchUrl = request.userData?.rootSearchUrl ?? request.loadedUrl ?? request.url;

            crawlerLog.info(`Processing page ${pageNo}: ${request.url}`);

            await page.waitForLoadState('domcontentloaded');
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
            await page.waitForTimeout(1500);

            let nextData = await waitForNextDataPayload(page, crawlerLog);
            if (!nextData) {
                nextData = await getFallbackNextDataFromUrlScan(rootSearchUrl, pageNo, crawlerLog);
            }
            if (!nextData) {
                crawlerLog.warning(`No __NEXT_DATA__ payload found for ${request.url}`);
                return;
            }

            const listingCandidate = extractListingItemsFromNextData(nextData);
            if (!listingCandidate.items.length) {
                crawlerLog.warning(`No listing array detected for ${request.url}`);
                return;
            }

            const normalizedItems = [];
            for (const rawItem of listingCandidate.items) {
                const normalized = normalizeListing(rawItem, {
                    searchUrl: rootSearchUrl,
                    pageUrl: request.loadedUrl ?? request.url,
                    pageNo,
                });

                if (!normalized) continue;

                const identity = String(getListingIdentity(normalized));
                if (!identity || seenListings.has(identity)) continue;

                seenListings.add(identity);
                normalizedItems.push(normalized);

                if (savedCount + normalizedItems.length >= resultsWanted) break;
            }

            if (normalizedItems.length > 0) {
                await Dataset.pushData(normalizedItems);
                savedCount += normalizedItems.length;
            }

            crawlerLog.info(
                `Detected ${listingCandidate.items.length} raw listings at ${listingCandidate.path}, saved ${normalizedItems.length} unique items, total ${savedCount}/${resultsWanted}`,
            );

            if (savedCount >= resultsWanted || pageNo >= maxPages || normalizedItems.length === 0) return;

            const nextPageUrl = await findNextPageUrl(page, request.loadedUrl ?? request.url, pageNo);
            if (!nextPageUrl) return;

            await enqueueLinks({
                urls: [nextPageUrl],
                userData: {
                    pageNo: pageNo + 1,
                    rootSearchUrl,
                },
            });
        },
        failedRequestHandler({ request }, error) {
            log.error(`Request failed for ${request.url}: ${error.message}`);
        },
    });

    const seedUrls = startUrls.length > 0 ? startUrls : [DEFAULT_START_URL];
    await crawler.run(
        seedUrls.map((url) => ({
            url,
            userData: {
                pageNo: 1,
                rootSearchUrl: url,
            },
        })),
    );

    log.info(`Extraction complete. Saved ${savedCount} listings.`);
}

main()
    .catch((error) => {
        log.exception(error, 'Actor run failed');
        process.exitCode = 1;
    })
    .finally(async () => {
        await Actor.exit();
    });
