const DEFAULT_CONFIG_URL = '/support-map.json';

const DEFAULT_MAP_CONFIG = {
    enabled: true,
    center: [123.8854, 10.3157],
    zoom: 12,
    minZoom: 8,
    maxZoom: 18,
    styleUrl: '/maps/support-vector-style.json',
    mapServerUrl: 'https://mapserver.pbb.ph',
    assets: {
        script: '/vendor/maplibre/maplibre-gl.js',
        css: '/vendor/maplibre/maplibre-gl.css',
    },
    tiles: {
        vector: 'https://mapserver.pbb.ph/tiles/vector/{z}/{x}/{y}.pbf',
        terrain: 'https://mapserver.pbb.ph/tiles/terrain/{z}/{x}/{y}.png',
        glyphs: 'https://mapserver.pbb.ph/tiles/glyphs/{fontstack}/{range}.pbf',
        poi: 'https://mapserver.pbb.ph/tiles/poi/{z}/{x}/{y}.pbf',
    },
    poi: {
        enabled: true,
        sourceLayers: ['poi', 'pois', 'point', 'points', 'amenity'],
        excludedClasses: [],
    },
    boundary: {
        enabled: false,
        url: '',
    },
};

const SOURCE_ID = 'support-dashboard-incidents';
const WORKBENCH_PULSE_LAYER_ID = 'support-dashboard-incidents-workbench-pulse';
const CIRCLE_LAYER_ID = 'support-dashboard-incidents-circle';
const LABEL_LAYER_ID = 'support-dashboard-incidents-label';
const POI_SOURCE_ID = 'support-dashboard-poi';
const POI_CIRCLE_LAYER_ID = 'support-dashboard-poi-circle';
const POI_LABEL_LAYER_ID = 'support-dashboard-poi-label';
const BOUNDARY_SOURCE_ID = 'support-dashboard-boundary';
const BOUNDARY_LINE_LAYER_ID = 'support-dashboard-boundary-line';
const SOURCE_BOUNDARY_PREFIX = 'support-dashboard-source-boundary';

let configPromise = null;
let maplibrePromise = null;

function mergeMapConfig(config) {
    return {
        ...DEFAULT_MAP_CONFIG,
        ...(config ?? {}),
        assets: {
            ...DEFAULT_MAP_CONFIG.assets,
            ...(config?.assets ?? {}),
        },
        tiles: {
            ...DEFAULT_MAP_CONFIG.tiles,
            ...(config?.tiles ?? {}),
        },
        poi: {
            ...DEFAULT_MAP_CONFIG.poi,
            ...(config?.poi ?? {}),
        },
        boundary: {
            ...DEFAULT_MAP_CONFIG.boundary,
            ...(config?.boundary ?? {}),
        },
    };
}

export async function fetchMapJson(url) {
    const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
    });

    if (!response.ok) {
        throw new Error(`Failed to load ${url} (${response.status})`);
    }

    return response.json();
}

export async function loadSupportMapConfig(configUrl = DEFAULT_CONFIG_URL) {
    if (!configPromise) {
        configPromise = fetchMapJson(configUrl)
            .then((payload) => mergeMapConfig(payload?.map))
            .catch(() => mergeMapConfig(null));
    }

    return configPromise;
}

function ensureStylesheet(href) {
    if (!href || document.querySelector(`link[data-dashboard-map-css="${CSS.escape(href)}"]`)) {
        return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.dashboardMapCss = href;
    document.head.appendChild(link);
}

function ensureScript(src) {
    if (!src) {
        return Promise.resolve();
    }

    const existing = document.querySelector(`script[data-dashboard-map-js="${CSS.escape(src)}"]`);
    if (existing) {
        return existing.dataset.loaded === 'true'
            ? Promise.resolve()
            : new Promise((resolve, reject) => {
                existing.addEventListener('load', resolve, { once: true });
                existing.addEventListener('error', reject, { once: true });
            });
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.dataset.dashboardMapJs = src;
        script.addEventListener('load', () => {
            script.dataset.loaded = 'true';
            resolve();
        }, { once: true });
        script.addEventListener('error', reject, { once: true });
        document.head.appendChild(script);
    });
}

export async function ensureMapLibre(config) {
    if (window.maplibregl) {
        return window.maplibregl;
    }

    if (!maplibrePromise) {
        ensureStylesheet(config.assets?.css);
        maplibrePromise = ensureScript(config.assets?.script).then(() => window.maplibregl);
    }

    return maplibrePromise;
}

export function applyTileConfig(style, config) {
    const nextStyle = JSON.parse(JSON.stringify(style));
    const sources = nextStyle.sources ?? {};

    if (sources.osm?.tiles?.length && config.tiles?.vector) {
        sources.osm.tiles = [config.tiles.vector];
    }

    if (sources.terrain?.tiles?.length && config.tiles?.terrain) {
        sources.terrain.tiles = [config.tiles.terrain];
    }

    if (sources['terrain-hillshade']?.tiles?.length && config.tiles?.terrain) {
        sources['terrain-hillshade'].tiles = [config.tiles.terrain];
    }

    if (nextStyle.glyphs && config.tiles?.glyphs) {
        nextStyle.glyphs = config.tiles.glyphs;
    }

    return nextStyle;
}

function parseIncidentCoordinates(item) {
    const coordinateSource = item?.source_snapshot?.incident_coordinates
        ?? item?.incident_coordinates
        ?? item?.coordinates
        ?? item?.location
        ?? item;
    const lat = Number(coordinateSource?.latitude ?? coordinateSource?.lat);
    const lng = Number(coordinateSource?.longitude ?? coordinateSource?.lng ?? coordinateSource?.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }

    return [lng, lat];
}

function statusTone(status) {
    const value = String(status ?? '').toLowerCase();

    if (value.includes('watch') || value.includes('monitor') || value.includes('yellow')) {
        return 'deferred';
    }

    if (value.includes('normal') || value.includes('green') || value.includes('stable') || value.includes('resolved')) {
        return 'resolved';
    }

    if (value.includes('critical') || value.includes('red') || value.includes('severe') || value.includes('discarded') || value.includes('cancelled')) {
        return 'discarded';
    }

    return 'active';
}

function alertBoundaryTone(alertLevel) {
    const value = String(alertLevel ?? '').toLowerCase();

    if (value.includes('critical')) {
        return 'critical';
    }

    if (value.includes('elevated') || value.includes('warning')) {
        return 'warning';
    }

    return 'info';
}

function alertBoundaryColors(alertLevel) {
    const tone = alertBoundaryTone(alertLevel);

    if (tone === 'critical') {
        return {
            fill: '#ff6b6b',
            line: '#ff9aa6',
            fillOpacity: 0.12,
            lineOpacity: 0.92,
        };
    }

    if (tone === 'warning') {
        return {
            fill: '#f6bd3b',
            line: '#ffd36a',
            fillOpacity: 0.1,
            lineOpacity: 0.9,
        };
    }

    return {
        fill: '#54c8f5',
        line: '#8fe6ff',
        fillOpacity: 0.08,
        lineOpacity: 0.88,
    };
}

function featureCollection(items, selectedIncidentId = null, visibleSourceIds = null) {
    const features = [];

    (Array.isArray(items) ? items : []).forEach((item) => {
        const sourceHubId = String(item?.source_hub_id ?? item?.sourceHubId ?? '').trim();

        if (visibleSourceIds instanceof Set && sourceHubId && !visibleSourceIds.has(sourceHubId)) {
            return;
        }

        const coordinates = parseIncidentCoordinates(item);
        const incidentId = Number(item?.id ?? item?.sitrep_id ?? item?.source_hub_id ?? 0);

        if (!coordinates || !incidentId) {
            return;
        }

        features.push({
            type: 'Feature',
            id: incidentId,
            geometry: {
                type: 'Point',
                coordinates,
            },
            properties: {
                id: incidentId,
                label: String(item?.display_id ?? item?.source_hub_name ?? item?.source_hub_id ?? `#${String(incidentId).padStart(6, '0')}`),
                source_hub_id: sourceHubId,
                status: String(item?.alert_level ?? item?.status ?? 'Active'),
                tone: statusTone(item?.alert_level ?? item?.status),
                selected: selectedIncidentId !== null && Number(selectedIncidentId) === incidentId,
                workbench_active: item?.workbench_active === true,
            },
        });
    });

    return {
        type: 'FeatureCollection',
        features,
    };
}

function incidentCircleColorExpression() {
    return [
        'match',
        ['get', 'tone'],
        'deferred',
        '#d8a332',
        'resolved',
        '#55c987',
        'discarded',
        '#c45b70',
        '#5fd1e0',
    ];
}

function addIncidentLayers(map) {
    if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
            type: 'geojson',
            data: featureCollection([]),
        });
    }

    if (!map.getLayer(CIRCLE_LAYER_ID)) {
        map.addLayer({
            id: CIRCLE_LAYER_ID,
            type: 'circle',
            source: SOURCE_ID,
            paint: {
                'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 8, 5],
                'circle-color': incidentCircleColorExpression(),
                'circle-opacity': 0.92,
                'circle-stroke-color': ['case', ['boolean', ['get', 'selected'], false], '#ffe08a', incidentCircleColorExpression()],
                'circle-stroke-width': ['case', ['boolean', ['get', 'selected'], false], 2.5, 1.2],
            },
        });
    }

    if (!map.getLayer(WORKBENCH_PULSE_LAYER_ID)) {
        map.addLayer({
            id: WORKBENCH_PULSE_LAYER_ID,
            type: 'circle',
            source: SOURCE_ID,
            filter: ['==', ['get', 'workbench_active'], true],
            paint: {
                'circle-radius': 12,
                'circle-color': incidentCircleColorExpression(),
                'circle-blur': 0.32,
                'circle-opacity': 0.58,
                'circle-stroke-color': incidentCircleColorExpression(),
                'circle-stroke-opacity': 0,
                'circle-stroke-width': 0,
            },
        }, CIRCLE_LAYER_ID);
    }

    if (!map.getLayer(LABEL_LAYER_ID)) {
        map.addLayer({
            id: LABEL_LAYER_ID,
            type: 'symbol',
            source: SOURCE_ID,
            layout: {
                'text-field': ['coalesce', ['get', 'label'], ''],
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                'text-size': 10,
                'text-offset': [0, -1.45],
                'text-anchor': 'bottom',
                'text-allow-overlap': true,
                'text-ignore-placement': true,
            },
            paint: {
                'text-color': incidentCircleColorExpression(),
                'text-halo-color': 'rgba(6, 18, 27, 0.95)',
                'text-halo-width': 1,
            },
        });
    }
}

function boundaryFeatureCount(boundary) {
    return Array.isArray(boundary?.features) ? boundary.features.length : 0;
}

function extendBoundsWithCoordinates(bounds, coordinates) {
    if (!Array.isArray(coordinates)) {
        return false;
    }

    if (
        coordinates.length >= 2
        && Number.isFinite(Number(coordinates[0]))
        && Number.isFinite(Number(coordinates[1]))
    ) {
        bounds.extend([Number(coordinates[0]), Number(coordinates[1])]);
        return true;
    }

    return coordinates.reduce((extended, child) => extendBoundsWithCoordinates(bounds, child) || extended, false);
}

async function loadBoundaryGeoJson(config) {
    if (config?.boundary?.enabled === false) {
        return null;
    }

    const boundaryUrl = String(config?.boundary?.url ?? '').trim();

    if (!boundaryUrl) {
        return null;
    }

    const geojson = await fetchMapJson(boundaryUrl);

    return geojson?.type === 'FeatureCollection' && boundaryFeatureCount(geojson) > 0 ? geojson : null;
}

function addBoundaryLayers(map, boundaryGeoJson, alertLevel = null) {
    if (!boundaryGeoJson) {
        return;
    }

    const colors = alertBoundaryColors(alertLevel);

    if (!map.getSource(BOUNDARY_SOURCE_ID)) {
        map.addSource(BOUNDARY_SOURCE_ID, {
            type: 'geojson',
            data: boundaryGeoJson,
        });
    } else {
        map.getSource(BOUNDARY_SOURCE_ID).setData(boundaryGeoJson);
    }

    if (!map.getLayer(BOUNDARY_LINE_LAYER_ID)) {
        map.addLayer({
            id: BOUNDARY_LINE_LAYER_ID,
            type: 'line',
            source: BOUNDARY_SOURCE_ID,
            paint: {
                'line-color': colors.line,
                'line-opacity': 0.96,
                'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.6, 14, 3.2],
            },
        }, CIRCLE_LAYER_ID);
    } else {
        map.setPaintProperty(BOUNDARY_LINE_LAYER_ID, 'line-color', colors.line);
        map.setPaintProperty(BOUNDARY_LINE_LAYER_ID, 'line-opacity', 0.96);
    }
}

function removeBoundaryLayers(map) {
    if (map?.getLayer?.(BOUNDARY_LINE_LAYER_ID)) {
        map.removeLayer(BOUNDARY_LINE_LAYER_ID);
    }

    if (map?.getSource?.(BOUNDARY_SOURCE_ID)) {
        map.removeSource(BOUNDARY_SOURCE_ID);
    }
}

function sourceBoundaryIds(sourceId) {
    const suffix = String(sourceId ?? '')
        .replace(/[^A-Za-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'source';

    return {
        source: `${SOURCE_BOUNDARY_PREFIX}-${suffix}`,
        fill: `${SOURCE_BOUNDARY_PREFIX}-${suffix}-fill`,
        line: `${SOURCE_BOUNDARY_PREFIX}-${suffix}-line`,
    };
}

function addSourceBoundaryLayers(map, sourceId, boundaryGeoJson, visible = true, alertLevel = null) {
    if (!boundaryGeoJson || boundaryFeatureCount(boundaryGeoJson) <= 0) {
        return;
    }

    const ids = sourceBoundaryIds(sourceId);
    const colors = alertBoundaryColors(alertLevel);

    if (!map.getSource(ids.source)) {
        map.addSource(ids.source, {
            type: 'geojson',
            data: boundaryGeoJson,
        });
    } else {
        map.getSource(ids.source).setData(boundaryGeoJson);
    }

    if (!map.getLayer(ids.fill)) {
        map.addLayer({
            id: ids.fill,
            type: 'fill',
            source: ids.source,
            layout: {
                visibility: visible ? 'visible' : 'none',
            },
            paint: {
                'fill-color': colors.fill,
                'fill-opacity': colors.fillOpacity,
            },
        }, CIRCLE_LAYER_ID);
    } else {
        map.setPaintProperty(ids.fill, 'fill-color', colors.fill);
        map.setPaintProperty(ids.fill, 'fill-opacity', colors.fillOpacity);
    }

    if (!map.getLayer(ids.line)) {
        map.addLayer({
            id: ids.line,
            type: 'line',
            source: ids.source,
            layout: {
                visibility: visible ? 'visible' : 'none',
            },
            paint: {
                'line-color': colors.line,
                'line-opacity': colors.lineOpacity,
                'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.1, 14, 2.4],
            },
        }, CIRCLE_LAYER_ID);
    } else {
        map.setPaintProperty(ids.line, 'line-color', colors.line);
        map.setPaintProperty(ids.line, 'line-opacity', colors.lineOpacity);
    }

    setLayerVisibility(map, [ids.fill, ids.line], visible);
}

function updateSourceBoundaryPaint(map, sourceId, alertLevel = null, focused = false) {
    const ids = sourceBoundaryIds(sourceId);
    const colors = alertBoundaryColors(alertLevel);

    if (map?.getLayer?.(ids.fill)) {
        map.setPaintProperty(ids.fill, 'fill-color', colors.fill);
        map.setPaintProperty(ids.fill, 'fill-opacity', focused ? Math.min(0.2, colors.fillOpacity + 0.08) : colors.fillOpacity);
    }

    if (map?.getLayer?.(ids.line)) {
        map.setPaintProperty(ids.line, 'line-color', colors.line);
        map.setPaintProperty(ids.line, 'line-opacity', focused ? 1 : colors.lineOpacity);
        map.setPaintProperty(
            ids.line,
            'line-width',
            focused
                ? ['interpolate', ['linear'], ['zoom'], 8, 2.4, 14, 4.8]
                : ['interpolate', ['linear'], ['zoom'], 8, 1.1, 14, 2.4],
        );
    }
}

function raiseSourceBoundaryLayers(map, sourceId) {
    const ids = sourceBoundaryIds(sourceId);

    if (map?.getLayer?.(ids.fill)) {
        map.moveLayer(ids.fill, CIRCLE_LAYER_ID);
    }

    if (map?.getLayer?.(ids.line)) {
        map.moveLayer(ids.line, CIRCLE_LAYER_ID);
    }
}

function removeSourceBoundaryLayers(map, sourceId) {
    const ids = sourceBoundaryIds(sourceId);

    [ids.line, ids.fill].forEach((layerId) => {
        if (map?.getLayer?.(layerId)) {
            map.removeLayer(layerId);
        }
    });

    if (map?.getSource?.(ids.source)) {
        map.removeSource(ids.source);
    }
}

function setLayerVisibility(map, layerIds, visible) {
    (Array.isArray(layerIds) ? layerIds : []).forEach((layerId) => {
        if (map?.getLayer?.(layerId)) {
            map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
        }
    });
}

function buildPoiClassExclusionFilter(excludedClasses) {
    const normalized = [...new Set((Array.isArray(excludedClasses) ? excludedClasses : [])
        .map((item) => String(item ?? '').trim().toLowerCase())
        .filter(Boolean))];

    if (!normalized.length) {
        return null;
    }

    return [
        'all',
        ['!', ['in', ['downcase', ['coalesce', ['get', 'class'], '']], ['literal', normalized]]],
        ['!', ['in', ['downcase', ['coalesce', ['get', 'type'], '']], ['literal', normalized]]],
        ['!', ['in', ['downcase', ['coalesce', ['get', 'subclass'], '']], ['literal', normalized]]],
    ];
}

function addPoiLayers(map, config) {
    if (!config.poi?.enabled || map.getLayer(POI_CIRCLE_LAYER_ID) || map.getLayer(POI_LABEL_LAYER_ID)) {
        return;
    }

    const configuredSource = String(config.poi?.source ?? '').trim();
    const sourceId = configuredSource || (config.tiles?.poi ? POI_SOURCE_ID : 'osm');

    if (sourceId === POI_SOURCE_ID && !map.getSource(POI_SOURCE_ID)) {
        if (!config.tiles?.poi) {
            return;
        }

        map.addSource(POI_SOURCE_ID, {
            type: 'vector',
            tiles: [config.tiles.poi],
            minzoom: 0,
            maxzoom: 14,
        });
    }

    if (!map.getSource(sourceId)) {
        return;
    }

    const filter = buildPoiClassExclusionFilter(config.poi.excludedClasses);
    const sourceLayerCandidates = Array.isArray(config.poi?.sourceLayers) && config.poi.sourceLayers.length
        ? config.poi.sourceLayers
        : ['poi', 'pois', 'point', 'points', 'amenity'];

    sourceLayerCandidates.some((sourceLayer) => {
        try {
            const circleLayer = {
                id: POI_CIRCLE_LAYER_ID,
                type: 'circle',
                source: sourceId,
                'source-layer': sourceLayer,
                minzoom: 11,
                paint: {
                    'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2.2, 15, 4],
                    'circle-color': '#f4b43d',
                    'circle-opacity': 0.65,
                    'circle-stroke-color': '#0b141b',
                    'circle-stroke-width': 0.7,
                },
            };
            const labelLayer = {
                id: POI_LABEL_LAYER_ID,
                type: 'symbol',
                source: sourceId,
                'source-layer': sourceLayer,
                minzoom: 13,
                layout: {
                    'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name'], ['get', 'class'], ['get', 'type'], ''],
                    'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                    'text-size': ['interpolate', ['linear'], ['zoom'], 13, 9, 16, 11],
                    'text-offset': [0, 0.9],
                    'text-anchor': 'top',
                },
                paint: {
                    'text-color': '#e8d8b0',
                    'text-halo-color': 'rgba(6, 18, 27, 0.95)',
                    'text-halo-width': 0.8,
                },
            };

            if (filter) {
                circleLayer.filter = filter;
                labelLayer.filter = filter;
            }

            map.addLayer(circleLayer, CIRCLE_LAYER_ID);
            map.addLayer(labelLayer, CIRCLE_LAYER_ID);
            return true;
        } catch (_) {
            if (map.getLayer(POI_CIRCLE_LAYER_ID)) {
                map.removeLayer(POI_CIRCLE_LAYER_ID);
            }
            if (map.getLayer(POI_LABEL_LAYER_ID)) {
                map.removeLayer(POI_LABEL_LAYER_ID);
            }
            return false;
        }
    });
}

export function createSupportDashboardMap(options = {}) {
    const container = options.container ?? null;
    const onIncidentClick = typeof options.onIncidentClick === 'function' ? options.onIncidentClick : null;
    let map = null;
    let config = null;
    let maplibregl = null;
    let initialized = false;
    let loaded = false;
    let unsupported = false;
    let pendingItems = [];
    let pendingSourceBoundaries = [];
    let visibleSourceIds = null;
    let selectedIncidentId = null;
    let terrainSpec = null;
    let boundaryGeoJson = null;
    let pendingContextBoundary = undefined;
    let contextBoundaryUrl = '';
    const sourceBoundaryGeoJsons = new Map();
    let highlightedSourceBoundaryId = null;
    let initialContentFitDone = false;
    let workbenchPulseFrame = null;

    function stopWorkbenchPulse() {
        if (workbenchPulseFrame !== null) {
            window.cancelAnimationFrame(workbenchPulseFrame);
            workbenchPulseFrame = null;
        }
    }

    function startWorkbenchPulse() {
        stopWorkbenchPulse();

        const animate = (timestamp) => {
            if (!map || !loaded || !map.getLayer(WORKBENCH_PULSE_LAYER_ID)) {
                workbenchPulseFrame = null;
                return;
            }

            const phase = (timestamp % 1450) / 1450;
            const eased = 1 - ((1 - phase) ** 3);
            const radius = 10 + (eased * 42);
            const opacity = Math.max(0, 0.62 * ((1 - phase) ** 1.85));

            map.setPaintProperty(WORKBENCH_PULSE_LAYER_ID, 'circle-radius', radius);
            map.setPaintProperty(WORKBENCH_PULSE_LAYER_ID, 'circle-opacity', opacity);
            workbenchPulseFrame = window.requestAnimationFrame(animate);
        };

        workbenchPulseFrame = window.requestAnimationFrame(animate);
    }

    function setSourceData() {
        if (!map || !loaded || !map.getSource(SOURCE_ID)) {
            return;
        }

        map.getSource(SOURCE_ID).setData(featureCollection(pendingItems, selectedIncidentId, visibleSourceIds));
    }

    function incidentBounds() {
        if (!maplibregl?.LngLatBounds) {
            return null;
        }

        const bounds = new maplibregl.LngLatBounds();
        let hasBounds = false;

        pendingItems.forEach((item) => {
            const sourceHubId = String(item?.source_hub_id ?? item?.sourceHubId ?? '').trim();

            if (visibleSourceIds instanceof Set && sourceHubId && !visibleSourceIds.has(sourceHubId)) {
                return;
            }

            const coordinates = parseIncidentCoordinates(item);
            if (!coordinates) {
                return;
            }

            bounds.extend(coordinates);
            hasBounds = true;
        });

        return hasBounds ? bounds : null;
    }

    function boundaryBounds() {
        if (!maplibregl?.LngLatBounds) {
            return null;
        }

        const bounds = new maplibregl.LngLatBounds();
        let hasBounds = false;

        if (Array.isArray(boundaryGeoJson?.features)) {
            boundaryGeoJson.features.forEach((feature) => {
                hasBounds = extendBoundsWithCoordinates(bounds, feature?.geometry?.coordinates) || hasBounds;
            });
        }

        sourceBoundaryGeoJsons.forEach((entry) => {
            if (!entry?.visible || !Array.isArray(entry.geojson?.features)) {
                return;
            }

            entry.geojson.features.forEach((feature) => {
                hasBounds = extendBoundsWithCoordinates(bounds, feature?.geometry?.coordinates) || hasBounds;
            });
        });

        return hasBounds ? bounds : null;
    }

    function sourceBoundaryBounds(sourceId) {
        if (!maplibregl?.LngLatBounds) {
            return null;
        }

        const entry = sourceBoundaryGeoJsons.get(String(sourceId ?? '').trim());

        if (!entry?.visible || !Array.isArray(entry.geojson?.features)) {
            return null;
        }

        const bounds = new maplibregl.LngLatBounds();
        let hasBounds = false;

        entry.geojson.features.forEach((feature) => {
            hasBounds = extendBoundsWithCoordinates(bounds, feature?.geometry?.coordinates) || hasBounds;
        });

        return hasBounds ? bounds : null;
    }

    function extendBoundsWithBounds(targetBounds, sourceBounds) {
        if (!targetBounds || !sourceBounds) {
            return false;
        }

        targetBounds.extend(sourceBounds.getSouthWest());
        targetBounds.extend(sourceBounds.getNorthEast());

        return true;
    }

    function contentBounds() {
        if (!maplibregl?.LngLatBounds) {
            return null;
        }

        const bounds = new maplibregl.LngLatBounds();
        let hasBounds = false;
        const boundary = boundaryBounds();
        const incidents = incidentBounds();

        if (boundary) {
            hasBounds = extendBoundsWithBounds(bounds, boundary) || hasBounds;
        }

        if (incidents) {
            hasBounds = extendBoundsWithBounds(bounds, incidents) || hasBounds;
        }

        return hasBounds ? bounds : null;
    }

    function fitBounds(bounds, options = {}) {
        if (!map || !bounds) {
            return false;
        }

        const width = Number(container?.clientWidth ?? 0);
        const height = Number(container?.clientHeight ?? 0);
        const sidePadding = Math.max(72, Math.round(width * 0.12));
        const verticalPadding = Math.max(88, Math.round(height * 0.14));

        map.fitBounds(bounds, {
            padding: {
                top: verticalPadding,
                bottom: verticalPadding,
                left: sidePadding,
                right: sidePadding,
            },
            maxZoom: Number(options.maxZoom ?? 15),
            duration: Number(options.duration ?? 850),
            essential: true,
        });

        return true;
    }

    function fitContent(options = {}) {
        return fitBounds(contentBounds(), options);
    }

    function fitBoundary(options = {}) {
        const bounds = boundaryBounds();

        return fitBounds(bounds, options);
    }

    async function syncSourceBoundaries() {
        if (!map || !loaded) {
            return;
        }

        const next = new Map();

        (Array.isArray(pendingSourceBoundaries) ? pendingSourceBoundaries : []).forEach((source) => {
            const id = String(source?.id ?? '').trim();
            const url = String(source?.boundary?.url ?? '').trim();

            if (!id || !url) {
                return;
            }

            next.set(id, {
                id,
                url,
                visible: source.visible !== false,
                alertLevel: source?.alert_level ?? source?.alertLevel ?? source?.status ?? null,
            });
        });

        [...sourceBoundaryGeoJsons.keys()].forEach((id) => {
            if (!next.has(id)) {
                removeSourceBoundaryLayers(map, id);
                sourceBoundaryGeoJsons.delete(id);
                if (highlightedSourceBoundaryId === id) {
                    highlightedSourceBoundaryId = null;
                }
            }
        });

        await Promise.all([...next.values()].map(async (source) => {
            const existing = sourceBoundaryGeoJsons.get(source.id);
            let geojson = existing?.geojson ?? null;

            if (!geojson || existing?.url !== source.url) {
                geojson = await fetchMapJson(source.url).catch(() => null);
            }

            if (!geojson || geojson.type !== 'FeatureCollection' || boundaryFeatureCount(geojson) <= 0) {
                removeSourceBoundaryLayers(map, source.id);
                sourceBoundaryGeoJsons.delete(source.id);
                return;
            }

            sourceBoundaryGeoJsons.set(source.id, {
                url: source.url,
                visible: source.visible,
                alertLevel: source.alertLevel,
                geojson,
            });
            addSourceBoundaryLayers(map, source.id, geojson, source.visible, source.alertLevel);
            updateSourceBoundaryPaint(map, source.id, source.alertLevel, highlightedSourceBoundaryId === source.id);
        }));
    }

    function highlightSourceBoundary(sourceId = null) {
        const id = String(sourceId ?? '').trim();

        if (!map || !loaded) {
            highlightedSourceBoundaryId = id || null;
            return false;
        }

        sourceBoundaryGeoJsons.forEach((entry, entryId) => {
            updateSourceBoundaryPaint(map, entryId, entry?.alertLevel, false);
        });

        if (!id || !sourceBoundaryGeoJsons.has(id)) {
            highlightedSourceBoundaryId = null;
            return false;
        }

        const entry = sourceBoundaryGeoJsons.get(id);

        if (entry?.visible === false) {
            highlightedSourceBoundaryId = null;
            return false;
        }

        highlightedSourceBoundaryId = id;
        updateSourceBoundaryPaint(map, id, entry?.alertLevel, true);
        raiseSourceBoundaryLayers(map, id);

        return true;
    }

    async function syncContextBoundary() {
        if (!map || !loaded) {
            return;
        }

        if (pendingContextBoundary === undefined) {
            return;
        }

        const url = String(pendingContextBoundary?.url ?? '').trim();

        if (!url) {
            boundaryGeoJson = null;
            contextBoundaryUrl = '';
            removeBoundaryLayers(map);
            return;
        }

        if (!boundaryGeoJson || contextBoundaryUrl !== url) {
            const geojson = await fetchMapJson(url).catch(() => null);

            if (!geojson || geojson.type !== 'FeatureCollection' || boundaryFeatureCount(geojson) <= 0) {
                boundaryGeoJson = null;
                contextBoundaryUrl = '';
                removeBoundaryLayers(map);
                return;
            }

            boundaryGeoJson = geojson;
            contextBoundaryUrl = url;
        }

        addBoundaryLayers(map, boundaryGeoJson, pendingContextBoundary?.alert_level ?? pendingContextBoundary?.alertLevel ?? null);
    }

    async function init() {
        if (initialized || unsupported || !container) {
            return;
        }

        initialized = true;
        config = await loadSupportMapConfig(options.configUrl);

        if (config.enabled === false) {
            unsupported = true;
            return;
        }

        ensureStylesheet(config.assets?.css);
        maplibregl = await ensureMapLibre(config);

        if (!maplibregl) {
            unsupported = true;
            return;
        }

        if (typeof maplibregl.supported === 'function' && !maplibregl.supported({ failIfMajorPerformanceCaveat: false })) {
            unsupported = true;
            return;
        }

        const [stylePayload, configuredBoundaryGeoJson] = await Promise.all([
            fetchMapJson(config.styleUrl),
            loadBoundaryGeoJson(config).catch(() => null),
        ]);
        const style = applyTileConfig(stylePayload, config);
        boundaryGeoJson = configuredBoundaryGeoJson;
        contextBoundaryUrl = String(config?.boundary?.url ?? '').trim();
        terrainSpec = style?.terrain ?? null;
        container.innerHTML = '';
        map = new maplibregl.Map({
            container,
            style,
            center: config.center,
            zoom: config.zoom,
            minZoom: config.minZoom,
            maxZoom: config.maxZoom,
            attributionControl: false,
        });

        map.on('load', () => {
            loaded = true;
            addIncidentLayers(map);
            addBoundaryLayers(map, boundaryGeoJson, pendingContextBoundary?.alert_level ?? pendingContextBoundary?.alertLevel ?? null);
            addPoiLayers(map, config);
            syncContextBoundary();
            syncSourceBoundaries().then(() => {
                if (!initialContentFitDone && fitContent()) {
                    initialContentFitDone = true;
                }
            });
            startWorkbenchPulse();
            setSourceData();
            [CIRCLE_LAYER_ID, LABEL_LAYER_ID].forEach((layerId) => {
                map.on('click', layerId, (event) => {
                    const feature = event.features?.[0];
                    const incidentId = Number(feature?.properties?.id ?? 0);
                    if (incidentId) {
                        onIncidentClick?.(incidentId);
                    }
                });
            });
            map.on('mouseenter', CIRCLE_LAYER_ID, () => {
                map.getCanvas().style.cursor = 'pointer';
            });
            map.on('mouseleave', CIRCLE_LAYER_ID, () => {
                map.getCanvas().style.cursor = '';
            });
        });
    }

    return {
        async init() {
            await init();
        },
        setIncidents(items = []) {
            pendingItems = Array.isArray(items) ? items : [];
            setSourceData();
        },
        setSourceBoundaries(sources = []) {
            pendingSourceBoundaries = Array.isArray(sources) ? sources : [];
            const ids = pendingSourceBoundaries
                .filter((source) => source?.visible !== false)
                .map((source) => String(source?.id ?? '').trim())
                .filter(Boolean);
            visibleSourceIds = pendingSourceBoundaries.length ? new Set(ids) : null;
            setSourceData();
            return syncSourceBoundaries();
        },
        setContextBoundary(boundary = null) {
            pendingContextBoundary = boundary && typeof boundary === 'object' ? boundary : null;
            return syncContextBoundary();
        },
        focusIncident(incidentId) {
            selectedIncidentId = Number(incidentId ?? 0) || null;
            setSourceData();
        },
        resize() {
            map?.resize?.();
        },
        fitIncidents(options = {}) {
            const bounds = incidentBounds();

            return fitBounds(bounds, {
                maxZoom: 14,
                duration: Number(options.duration ?? 700),
            });
        },
        fitContent(options = {}) {
            return fitContent(options);
        },
        fitBoundary(options = {}) {
            return fitBoundary(options);
        },
        fitSourceBoundary(sourceId, options = {}) {
            return fitBounds(sourceBoundaryBounds(sourceId), {
                maxZoom: Number(options.maxZoom ?? 15.5),
                duration: Number(options.duration ?? 700),
            });
        },
        highlightSourceBoundary(sourceId = null) {
            return highlightSourceBoundary(sourceId);
        },
        clearSourceBoundaryHighlight() {
            return highlightSourceBoundary(null);
        },
        getMap() {
            return map;
        },
        setLayerGroupVisibility(groupId, visible) {
            if (groupId === 'incidents') {
                setLayerVisibility(map, [WORKBENCH_PULSE_LAYER_ID, CIRCLE_LAYER_ID, LABEL_LAYER_ID], visible);
            } else if (groupId === 'boundary') {
                setLayerVisibility(map, [BOUNDARY_LINE_LAYER_ID], visible);
                sourceBoundaryGeoJsons.forEach((entry, sourceId) => {
                    const ids = sourceBoundaryIds(sourceId);
                    setLayerVisibility(map, [ids.fill, ids.line], visible && entry?.visible !== false);
                });
            } else if (groupId === 'terrain') {
                if (map?.setTerrain && terrainSpec) {
                    map.setTerrain(visible ? terrainSpec : null);
                }
                setLayerVisibility(map, ['terrain-hillshade'], visible);
            } else if (groupId === 'poi') {
                setLayerVisibility(map, [POI_CIRCLE_LAYER_ID, POI_LABEL_LAYER_ID], visible);
            }
        },
        hasTerrainLayer() {
            return Boolean(terrainSpec || map?.getLayer?.('terrain-hillshade'));
        },
        hasBoundaryLayer() {
            return boundaryFeatureCount(boundaryGeoJson) > 0
                || sourceBoundaryGeoJsons.size > 0
                || (Array.isArray(pendingSourceBoundaries) && pendingSourceBoundaries.some((source) => source?.boundary?.url));
        },
        destroy() {
            stopWorkbenchPulse();
            map?.remove?.();
            map = null;
            loaded = false;
            initialized = false;
        },
        isAvailable() {
            return !!map && !unsupported;
        },
        hasRenderableItems(items = pendingItems) {
            return (Array.isArray(items) ? items : []).some((item) => parseIncidentCoordinates(item));
        },
    };
}

export const createDashboardMap = createSupportDashboardMap;
