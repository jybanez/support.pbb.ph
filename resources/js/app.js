import './bootstrap';
import { createSupportDashboardMap } from './maps/supportDashboardMap.js';

const root = document.getElementById('app');
const csrfMeta = document.querySelector('meta[name="csrf-token"]');
const helperLoaderUrl = '/vendor/helpers.pbb.ph/js/ui/ui.loader.js';
const { uiLoader } = await import(/* @vite-ignore */ helperLoaderUrl);
const helperLoadOptions = { preferBundles: true };
uiLoader.setPreferBundles(true);
await uiLoader.loadMany([
    'ui.navbar',
    'ui.drawer',
    'ui.splitter',
    'ui.map.controls',
    'ui.virtual.list',
    'ui.select',
    'ui.elapsed.time',
    'ui.clock',
    'ui.heartbeat.strip',
    'ui.skeleton',
    'ui.toggle.button',
    'ui.form.modal',
    'ui.form.modal.login',
    'ui.form.modal.reauth',
    'ui.form.modal.account',
    'ui.form.modal.change.password',
    'ui.dialog.alert',
    'ui.dialog.confirm',
], helperLoadOptions);

const helpers = {
    createNavbar: await uiLoader.get('ui.navbar', helperLoadOptions),
    createDrawer: await uiLoader.get('ui.drawer', helperLoadOptions),
    createSplitter: await uiLoader.get('ui.splitter', helperLoadOptions),
    createMapControls: await uiLoader.get('ui.map.controls', helperLoadOptions),
    createVirtualList: await uiLoader.get('ui.virtual.list', helperLoadOptions),
    createSelect: await uiLoader.get('ui.select', helperLoadOptions),
    createElapsedTime: await uiLoader.get('ui.elapsed.time', helperLoadOptions),
    createClock: await uiLoader.get('ui.clock', helperLoadOptions),
    createHeartbeatStrip: await uiLoader.get('ui.heartbeat.strip', helperLoadOptions),
    createSkeleton: await uiLoader.get('ui.skeleton', helperLoadOptions),
    createToggleButton: await uiLoader.get('ui.toggle.button', helperLoadOptions),
    createFormModal: await uiLoader.get('ui.form.modal', helperLoadOptions),
    createLoginFormModal: await uiLoader.get('ui.form.modal.login', helperLoadOptions),
    createReauthFormModal: await uiLoader.get('ui.form.modal.reauth', helperLoadOptions),
    createAccountFormModal: await uiLoader.get('ui.form.modal.account', helperLoadOptions),
    createChangePasswordFormModal: await uiLoader.get('ui.form.modal.change.password', helperLoadOptions),
    uiAlert: await uiLoader.get('ui.dialog.alert', helperLoadOptions),
    uiConfirm: await uiLoader.get('ui.dialog.confirm', helperLoadOptions),
};

const now = () => Date.now();
const SESSION_REMEMBERED_KEY = 'pbb.support.session.remembered';
const KEEPALIVE_CHECK_INTERVAL_MS = 30 * 1000;
const KEEPALIVE_MAX_CADENCE_MS = 10 * 60 * 1000;

const state = {
    app: {
        name: root?.dataset.appName || 'PBB Support System',
        page: root?.dataset.page || 'dashboard',
    },
    account: null,
    csrfToken: csrfMeta?.getAttribute('content') || '',
    hub: {
        available: false,
        url: 'https://relay.pbb.ph/hub.json',
        data: null,
    },
    sessionLifetimeMinutes: 30 * 24 * 60,
    settings: {
        relayTargetSystem: 'sitrep.ingestor',
        consolidationCadenceMinutes: 15,
        alertLevel: 'Normal',
        relayUrl: 'https://relay.pbb.ph',
        relayToken: '',
        relayHandlerToken: '',
        realtimeUrl: 'https://realtime.pbb.ph',
        realtimeClientCode: '',
        serverProjectCode: '',
        adminProjectCode: '',
        realtimeBackendIngressSecret: '',
    },
    reauthOpen: false,
    lastServerTouchAt: now(),
    keepaliveInFlight: false,
    currentSitrep: {
        loading: false,
        available: false,
        html: null,
        css: null,
        sitrep: null,
        identity: null,
        contextBoundary: null,
        sections: [],
        sources: [],
        sourceHeartbeats: [],
        activeSection: 'summary',
        mapPoints: [],
    },
};

let navbar = null;
let loginModal = null;
let reauthModal = null;
let accountModal = null;
let passwordModal = null;
let usersModal = null;
let supportRequestsModal = null;
let settingsModal = null;
let dashboardSplitter = null;
let dashboardMap = null;
let dashboardMapControls = null;
let dashboardMapResizeObserver = null;
let navbarClock = null;
let currentSitrepStyleMounted = false;
let sourceVirtualList = null;
let usersVirtualList = null;
let supportRequestsVirtualList = null;
let sourceAlertSelect = null;
let usersListLoaded = false;
let usersListLoading = false;
let supportRequestsLoaded = false;
let supportRequestsLoading = false;
const sourceDataVisibleIds = new Set();
const sourceFilters = {
    search: '',
    alertLevels: [],
};
let usersListData = [];
let supportRequestsData = [];
let selectedSupportRequestId = null;
const userFilters = {
    search: '',
};
const supportRequestFilters = {
    search: '',
};

const icons = {
    brand: '<span class="support-brand-mark">PS</span>',
    dashboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>',
    sitrep: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6V3zm8 1v3h3"/></svg>',
    map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2V6zm5-2v14m6-12v14"/></svg>',
    support: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 4.5V13c0 4.5-3 6.9-8 8-5-1.1-8-3.5-8-8V7.5L12 3z"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0"/></svg>',
    users: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a3 3 0 100-6 3 3 0 000 6zM8 12a4 4 0 100-8 4 4 0 000 8zm8 2c2.8 0 5 1.8 5 4v1h-5m-8-5c-3.3 0-6 2.1-6 4.7V20h12v-1.3C14 16.1 11.3 14 8 14z"/></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 110 7 3.5 3.5 0 010-7zm0-5l1.3 2.2 2.5.7 2.2-1.2 1.8 3.1-1.8 1.8.2 1.4 2 1.5-1.8 3.1-2.5-.7-1.1.9-.4 2.6H9.6l-.4-2.6-1.1-.9-2.5.7L3.8 13l2-1.5.2-1.4-1.8-1.8L6 5.2l2.2 1.2 2.5-.7L12 3.5z"/></svg>',
    login: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3m12-8h4a2 2 0 012 2v12a2 2 0 01-2 2h-4"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 00-3-3L5 17v3z"/><path d="M13.5 7.5l3 3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.25 12s3.5-6.25 9.75-6.25S21.75 12 21.75 12s-3.5 6.25-9.75 6.25S2.25 12 2.25 12z"/><circle cx="12" cy="12" r="3.25"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.7 5.9A10.5 10.5 0 0112 5.75c6.25 0 9.75 6.25 9.75 6.25a16.8 16.8 0 01-3.04 3.78"/><path d="M14.12 14.12A3.25 3.25 0 019.88 9.88"/><path d="M6.64 6.64A16.9 16.9 0 002.25 12s3.5 6.25 9.75 6.25a10.6 10.6 0 004.22-.87"/></svg>',
};

const setCsrfToken = (token) => {
    if (!token) return;
    state.csrfToken = token;
    csrfMeta?.setAttribute('content', token);
};

const markServerTouch = (payload = {}) => {
    state.lastServerTouchAt = payload.touched_at ? Date.parse(payload.touched_at) || now() : now();
};

const setSessionRemembered = (remembered) => {
    try {
        if (remembered) {
            window.localStorage?.setItem(SESSION_REMEMBERED_KEY, '1');
        } else {
            window.localStorage?.removeItem(SESSION_REMEMBERED_KEY);
        }
    } catch {
        // Local storage can be unavailable in hardened browser contexts.
    }
};

const normalizeErrors = (errors = {}) => Object.fromEntries(
    Object.entries(errors).map(([field, messages]) => [
        field,
        Array.isArray(messages) ? messages[0] : String(messages || ''),
    ]),
);

const fieldErrors = (error) => error?.payload?.errors || {};

const firstError = (error, fallback = 'Please check the form and try again.') => {
    const errors = fieldErrors(error);
    const first = Object.values(errors)[0];

    if (Array.isArray(first) && first.length) {
        return first[0];
    }

    return error?.message || fallback;
};

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const titleCase = (value) => String(value ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatSitrepHeaderDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const parts = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Manila',
    }).formatToParts(date).reduce((values, part) => {
        values[part.type] = part.value;
        return values;
    }, {});
    const time = [parts.hour, parts.minute, parts.second].filter(Boolean).join(':');

    return `${parts.month} ${parts.day}, ${parts.year} - ${time}`;
};

const alertToneClass = (alertLevel) => {
    const normalized = String(alertLevel ?? '').trim().toLowerCase();

    if (normalized === 'critical') {
        return 'is-alert-critical';
    }

    if (normalized === 'elevated') {
        return 'is-alert-warning';
    }

    if (normalized === 'normal') {
        return 'is-alert-info';
    }

    return 'is-alert-info';
};

const api = async (url, options = {}) => {
    const {
        reauthOnUnauthorized = true,
        ...fetchOptions
    } = options;
    const headers = {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...fetchOptions.headers,
    };

    if (!(fetchOptions.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    if (state.csrfToken) {
        headers['X-CSRF-TOKEN'] = state.csrfToken;
    }

    const response = await fetch(url, {
        credentials: 'same-origin',
        ...fetchOptions,
        headers,
    });

    const payload = await response.json().catch(() => ({}));

    if (reauthOnUnauthorized && (response.status === 401 || response.status === 419) && state.account) {
        openReauth();
    }

    if (!response.ok) {
        const error = new Error(payload.message || payload.error || 'Request failed.');
        error.status = response.status;
        error.payload = payload;
        throw error;
    }

    return payload.data ?? payload;
};

const refreshCsrfToken = async () => {
    const response = await fetch('/api/csrf-token', {
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(payload.message || payload.error || 'Unable to refresh session token.');
        error.status = response.status;
        error.payload = payload;
        throw error;
    }

    const data = payload.data ?? payload;
    setCsrfToken(data.csrf_token || data.csrfToken);

    return state.csrfToken;
};

const loginWithCredentials = async (values) => {
    const submit = () => api('/api/login', {
        method: 'POST',
        body: JSON.stringify(values),
        reauthOnUnauthorized: false,
    });

    try {
        return await submit();
    } catch (error) {
        if (error.status !== 419) {
            throw error;
        }

        await refreshCsrfToken();
        return submit();
    }
};

const syncAuthFromBootstrap = async () => {
    const data = await api(`/api/bootstrap?page=${encodeURIComponent(state.app.page)}`, {
        reauthOnUnauthorized: false,
    });

    state.app = data.app;
    state.account = data.auth.account;
    setSessionRemembered(Boolean(state.account));
    state.hub = data.hub || state.hub;
    state.settings = {
        ...state.settings,
        ...(data.settings || {}),
    };
    state.sessionLifetimeMinutes = data.security.sessionLifetimeMinutes;
    setCsrfToken(data.security.csrfToken);
    markServerTouch(data.security);

    return data;
};

const applySessionPayload = (data = {}) => {
    if ('account' in data) {
        state.account = data.account;
        setSessionRemembered(Boolean(data.account));
    }
    setCsrfToken(data.csrf_token || data.csrfToken);
    markServerTouch(data);
};

const pageTitle = () => (state.account ? 'Support Operations Dashboard' : 'PBB Support Identity');

const renderStatusContent = () => {
    const status = document.createElement('span');
    status.className = state.account ? 'support-nav-status is-authenticated' : 'support-nav-status';
    status.innerHTML = `<span class="support-nav-status-dot"></span>${state.account ? 'Session active' : 'Login required'}`;
    return status;
};

const destroyNavbarClock = () => {
    navbarClock?.destroy?.();
    navbarClock = null;
};

const renderHeaderClock = () => {
    if (!state.account) {
        return null;
    }

    const host = document.createElement('div');
    host.className = 'support-header-clock';

    navbarClock = helpers.createClock(host, {
        label: 'Local Time',
        timezone: 'Asia/Manila',
        locale: 'en-US',
        showSeconds: true,
        hour12: true,
        dateFormat: 'short',
        running: true,
        variant: 'neutral',
        size: 'sm',
        chrome: true,
        ariaLabel: 'Support system clock',
    });

    return host;
};

const navActions = () => {
    if (!state.account) {
        return [{ id: 'login', label: 'Login', icon: icons.login }];
    }

    const initial = (state.account.name || state.account.email || '?').charAt(0).toUpperCase();
    const actions = [];

    actions.push({
        id: 'support-requests',
        label: 'Requests',
        icon: icons.support,
    });

    if (state.account.role === 'admin') {
        actions.push({
            id: 'users',
            label: 'Users',
            icon: icons.users,
        });
        actions.push({
            id: 'settings',
            label: 'Settings',
            icon: icons.settings,
        });
    }

    actions.push({
        id: 'profile',
        label: initial,
        icon: icons.user,
        menuItems: [
            { id: 'account', label: 'Account' },
            { id: 'logout', label: 'Logout', danger: true },
        ],
    });

    return actions;
};

const renderNavbar = () => {
    const host = document.querySelector('[data-navbar-host]');
    if (!host) return;

    destroyNavbarClock();

    const options = {
        brandText: state.app.name,
        brandSubtitle: 'SITREP support operations',
        brandMedia: icons.brand,
        activeId: 'dashboard',
        mobileCollapse: true,
        statusContentLabel: state.account ? '' : 'Session status',
        statusContent: state.account ? null : renderStatusContent,
        contentCenter: state.account ? renderHeaderClock : null,
        contentCenterMobile: state.account ? {
            id: 'clock',
            label: 'Local Time',
            disabled: true,
        } : null,
        items: [],
        actions: navActions(),
        onNavigate(item) {
            if (item?.id === 'brand') {
                state.app.page = 'dashboard';
            }
        },
        onAction(action) {
            if (action?.id === 'login') {
                openLogin();
            }
            if (action?.id === 'users') {
                openUsers();
            }
            if (action?.id === 'support-requests') {
                openSupportRequests();
            }
            if (action?.id === 'settings') {
                openSettings();
            }
        },
        onActionMenuSelect(action, item) {
            if (action?.id !== 'profile') return;
            if (item?.id === 'account') openAccount();
            if (item?.id === 'logout') logout();
        },
    };

    if (navbar) {
        navbar.update({}, options);
        return;
    }

    navbar = helpers.createNavbar(host, {}, options);
};

const emptyState = () => `
    <section class="feature-page">
        <div class="feature-shell">
            <section class="feature-content">
                ${hubIdentity()}
            </section>
        </div>
    </section>
`;

const hubIdentity = () => {
    if (!state.hub.available || !state.hub.data) {
        return `
            <div class="support-empty ui-surface">
                <p class="ui-eyebrow">hub.json unavailable</p>
                <h2 class="ui-title">Relay identity is not available.</h2>
                <p>The app could not load ${escapeHtml(state.hub.url)}. Public identity will appear here when the Relay hub metadata is reachable.</p>
            </div>
        `;
    }

    const hub = state.hub.data;
    const uplinks = Array.isArray(hub.uplinks) ? hub.uplinks : [];
    const sources = Array.isArray(hub.sources) ? hub.sources : [];

    return `
        <div class="hub-home">
            <section class="hub-identity-card ui-surface">
                <div>
                    <p class="ui-eyebrow">Local hub</p>
                    <h2 class="ui-title">${escapeHtml(hub.name || 'Unnamed PBB hub')}</h2>
                </div>
                <dl class="hub-facts">
                    ${hubFact('Relay hub ID', hub.relay_hub_id)}
                    ${hubFact('Hub ID', hub.hub_id)}
                    ${hubFact('Domain', hub.domain)}
                    ${hubFact('Barangay code', hub.brgy_code)}
                </dl>
            </section>
            <section class="hub-flow-grid">
                ${nodeList('Uplinks', 'SITREPs from this Support System will be relayed upstream to these nodes.', uplinks, 'uplink')}
                ${nodeList('Sources', 'This Support System receives SITREPs from these source nodes.', sources, 'source')}
            </section>
        </div>
    `;
};

const hubFact = (label, value) => `
    <div>
        <dt>${escapeHtml(label)}</dt>
        <dd>${escapeHtml(value || '-')}</dd>
    </div>
`;

const nodeList = (title, description, nodes, type) => `
    <article class="hub-node-panel ui-panel">
        <header>
            <div>
                <p class="ui-eyebrow">${escapeHtml(title)}</p>
                <h2 class="ui-title">${nodes.length}</h2>
            </div>
            <p>${escapeHtml(description)}</p>
        </header>
        <div class="hub-node-list">
            ${nodes.length ? nodes.map((node) => nodeCard(node, type)).join('') : emptyNode(type)}
        </div>
    </article>
`;

const nodeCard = (node, type) => {
    const hub = node.hub || node.source || node;
    const domain = node.uplink_domain || node.source_domain || hub.domain || node.domain;
    const name = hub.name || node.name || domain || 'Unnamed node';
    const deployment = hub.deployment || node.deployment || type;
    const status = hub.status || node.status || '-';
    const relation = type === 'uplink' ? node.uplink_type : node.source_type;

    return `
        <div class="hub-node-card">
            <div>
                <strong>${escapeHtml(name)}</strong>
                <span>${escapeHtml(domain || '-')}</span>
            </div>
            <dl>
                ${hubFact('Deployment', deployment)}
                ${hubFact('Status', status)}
                ${hubFact(type === 'uplink' ? 'Uplink type' : 'Source type', relation)}
                ${hubFact('Priority', node.priority)}
            </dl>
            ${node.is_primary ? '<span class="ui-badge">Primary</span>' : ''}
        </div>
    `;
};

const emptyNode = (type) => `
    <div class="hub-node-empty">
        <p>No ${type === 'uplink' ? 'uplink' : 'source'} nodes are listed in hub.json.</p>
    </div>
`;

const dashboard = () => `
    <section class="feature-page">
        <div class="feature-shell feature-shell-dashboard">
            <section class="feature-content">
                <div class="support-dashboard-layout">
                    <div class="support-dashboard-splitter-host" data-dashboard-splitter></div>
                    <section class="support-dashboard-pane support-dashboard-sources-rail" aria-label="SITREP source hubs">
                        <div class="support-dashboard-pane-body">
                            <div data-dashboard-sources-host></div>
                        </div>
                    </section>
                </div>
            </section>
        </div>
    </section>
`;

const createDashboardMapPane = () => {
    const pane = document.createElement('section');
    pane.className = 'support-dashboard-map-pane';
    pane.setAttribute('aria-label', 'Support operations map');
    pane.innerHTML = `
        <div class="support-dashboard-map-canvas" data-dashboard-map-canvas></div>
        <div class="support-dashboard-map-empty" data-dashboard-map-empty>Loading support map...</div>
        <div class="support-dashboard-map-controls" data-dashboard-map-controls></div>
    `;
    return pane;
};

const createDashboardPane = (className, title, body) => {
    const pane = document.createElement('section');
    pane.className = `support-dashboard-pane ${className}`;
    pane.innerHTML = `
        ${title ? `<header><p class="ui-eyebrow">${escapeHtml(title)}</p></header>` : ''}
        <div class="support-dashboard-pane-body">
            ${body}
        </div>
    `;
    return pane;
};

const mountSitrepViewerCss = (css) => {
    if (!css || currentSitrepStyleMounted) {
        return;
    }

    const style = document.createElement('style');
    style.dataset.supportSitrepViewerCss = 'true';
    style.textContent = css;
    document.head.appendChild(style);
    currentSitrepStyleMounted = true;
};

const currentSitrepSourceId = (source) => String(source?.id || source?.code || source?.name || '').trim();

const sourceHeartbeatKeys = (source = {}) => [
    source?.id,
    source?.relay_hub_id,
    source?.source_hub_id,
    source?.source_relay_hub_id,
    source?.code,
    source?.data?.source_hub_id,
    source?.data?.source_relay_hub_id,
    source?.data?.snapshot?.hub_id,
    source?.data?.snapshot?.relay_hub_id,
]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

const heartbeatKeys = (heartbeat = {}) => [
    heartbeat?.source_hub_id,
    heartbeat?.source_relay_hub_id,
    heartbeat?.hub_id,
    heartbeat?.relay_hub_id,
]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

const mergeSourceHeartbeats = (sources = [], heartbeats = []) => {
    const byHubId = new Map();
    (heartbeats || []).forEach((heartbeat) => {
        heartbeatKeys(heartbeat).forEach((key) => {
            if (!byHubId.has(key)) {
                byHubId.set(key, heartbeat);
            }
        });
    });

    return (sources || []).map((source) => ({
        ...source,
        heartbeat: sourceHeartbeatKeys(source).map((key) => byHubId.get(key)).find(Boolean) || null,
    }));
};

const visibleSourceMapRecords = () => (state.currentSitrep.sources || [])
    .map((source) => ({
        ...source,
        id: currentSitrepSourceId(source),
        visible: !sourceDataVisibleIds.has(currentSitrepSourceId(source)),
    }))
    .filter((source) => source.id);

const syncSourceBoundaries = () => {
    return dashboardMap?.setSourceBoundaries?.(visibleSourceMapRecords());
};

const setAllSourcesVisible = (visible) => {
    if (visible) {
        sourceDataVisibleIds.clear();
    } else {
        (state.currentSitrep.sources || []).forEach((source) => {
            const sourceId = currentSitrepSourceId(source);
            if (sourceId) {
                sourceDataVisibleIds.add(sourceId);
            }
        });
        dashboardMap?.clearSourceBoundaryHighlight?.();
    }

    syncSourceBoundaries();
    mountSourcesList(document.querySelector('[data-sitrep-sources-list]'), filteredSources());
};

const filteredSources = () => {
    const search = String(sourceFilters.search || '').trim().toLowerCase();
    const alertLevels = new Set((sourceFilters.alertLevels || [])
        .map((level) => String(level || '').trim().toLowerCase())
        .filter(Boolean));

    return (state.currentSitrep.sources || []).filter((source) => {
        const alertLevel = String(source?.alert_level || '').trim().toLowerCase();
        if (alertLevels.size && !alertLevels.has(alertLevel)) {
            return false;
        }

        if (!search) {
            return true;
        }

        return [
            source?.name,
            source?.subtitle,
            source?.code,
            source?.domain,
            source?.status,
            source?.alert_level,
        ].some((value) => String(value || '').toLowerCase().includes(search));
    });
};

const refreshSourcesList = () => {
    mountSourcesList(document.querySelector('[data-sitrep-sources-list]'), filteredSources());
};

const syncContextBoundary = () => {
    const boundary = state.currentSitrep.contextBoundary || null;

    return dashboardMap?.setContextBoundary?.(boundary
        ? {
            ...boundary,
            alert_level: state.currentSitrep.sitrep?.alert_level || state.settings.alertLevel || 'Normal',
        }
        : null);
};

const setSourceToggleButtonIcon = (host, visible) => {
    const button = host?.querySelector?.('button');
    if (!button) return;

    button.innerHTML = visible ? icons.eyeOff : icons.eye;
    button.setAttribute('aria-label', visible ? 'Hide source boundary' : 'View source boundary');
    button.setAttribute('title', visible ? 'Hide source boundary' : 'View source boundary');
};

const sourceHeartbeatStrip = (heartbeat) => {
    const host = document.createElement('div');
    host.className = 'support-source-heartbeat-strip';

    helpers.createHeartbeatStrip(host, {
        status: heartbeat?.status || 'unknown',
        lastSeenAt: heartbeat?.last_seen_at || heartbeat?.lastSeenAt || '',
        ageSeconds: heartbeat?.age_seconds ?? heartbeat?.ageSeconds ?? null,
        history: Array.isArray(heartbeat?.history) ? heartbeat.history : [],
        bucketCount: 48,
        rangeLabel: 'Past 48 hours',
        compact: true,
        chrome: false,
        showStatus: true,
        showAge: true,
        showAverage: false,
        ariaLabel: 'Source relay heartbeat over the past 48 hours',
        className: 'support-source-heartbeat-strip-ui',
    });

    return host;
};

const mountSkeleton = (container, data = {}, options = {}) => {
    if (!container) return null;

    return helpers.createSkeleton(container, data, options);
};

const mountLoadingSkeletons = (host) => {
    host.querySelectorAll('[data-skeleton]').forEach((container) => {
        mountSkeleton(container, {
            lines: Number(container.dataset.skeletonLines || 4),
            rows: Number(container.dataset.skeletonRows || 2),
        }, {
            variant: container.dataset.skeletonVariant || 'lines',
            columns: Number(container.dataset.skeletonColumns || 3),
            className: container.dataset.skeletonClass || '',
        });
    });
};

const sourceCard = (source) => {
    const card = document.createElement('article');
    card.className = ['support-source-card', alertToneClass(source?.alert_level)].filter(Boolean).join(' ');
    const sourceId = currentSitrepSourceId(source);
    const sourceVisible = !sourceDataVisibleIds.has(sourceId);
    const isSourceBoundaryVisible = () => !sourceDataVisibleIds.has(sourceId);

    const top = document.createElement('div');
    top.className = 'support-source-card-top';

    const heading = document.createElement('div');
    heading.className = 'support-source-card-heading';

    const title = document.createElement('h3');
    title.textContent = source?.name || 'Source hub';
    heading.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'support-source-card-subtitle';
    subtitle.textContent = source?.subtitle || source?.domain || source?.code || 'No deployment label';

    if (source?.alert_level) {
        const alertBadge = document.createElement('span');
        alertBadge.className = ['support-source-alert', alertToneClass(source.alert_level)].filter(Boolean).join(' ');
        alertBadge.textContent = titleCase(source.alert_level);
        subtitle.append(' · ', alertBadge);
    }

    if (source?.snapshot_at) {
        const elapsedHost = document.createElement('span');
        elapsedHost.className = 'support-source-card-elapsed';
        subtitle.append(' · ', elapsedHost);
        helpers.createElapsedTime(elapsedHost, {
            startTime: source.snapshot_at,
            endTime: null,
            running: true,
            format: 'compact',
            size: 'sm',
            variant: 'info',
            chrome: false,
            suffix: ' old',
            showSuffix: true,
            invalidText: 'freshness unknown',
            ariaLabel: 'Source snapshot freshness',
        });
    }

    heading.appendChild(subtitle);

    if (source?.heartbeat) {
        heading.appendChild(sourceHeartbeatStrip(source.heartbeat));
    }

    const toggleHost = document.createElement('div');
    toggleHost.className = 'support-source-card-toggle';
    toggleHost.addEventListener('click', (event) => {
        event.stopPropagation();
    });

    top.append(heading, toggleHost);
    card.appendChild(top);

    card.addEventListener('mouseenter', () => {
        if (isSourceBoundaryVisible()) {
            dashboardMap?.highlightSourceBoundary?.(sourceId);
        }
    });

    card.addEventListener('mouseleave', () => {
        dashboardMap?.clearSourceBoundaryHighlight?.();
    });

    card.addEventListener('click', (event) => {
        if (event.target?.closest?.('button')) {
            return;
        }

        if (isSourceBoundaryVisible()) {
            dashboardMap?.fitSourceBoundary?.(sourceId, { duration: 650 });
        }
    });

    const toggle = helpers.createToggleButton(toggleHost, {
        id: `source-boundary-${sourceId}`,
        label: sourceVisible ? 'Hide source boundary' : 'View source boundary',
        pressed: sourceVisible,
        variant: 'icon',
        tone: 'success',
        size: 'sm',
        quiet: true,
        leadingDot: false,
        icon: sourceVisible ? 'eye-off' : 'eye',
        pressedIcon: 'eye-off',
        unpressedIcon: 'eye',
        ariaLabel: sourceVisible ? 'Hide source boundary' : 'View source boundary',
        onChange({ pressed, button }) {
            if (!pressed) {
                sourceDataVisibleIds.add(sourceId);
            } else {
                sourceDataVisibleIds.delete(sourceId);
            }

            button.setLabel?.(pressed ? 'Hide source boundary' : 'View source boundary');
            setSourceToggleButtonIcon(toggleHost, pressed);
            if (!pressed) {
                dashboardMap?.clearSourceBoundaryHighlight?.();
            }
            syncSourceBoundaries();
        },
    });
    toggle.setLabel?.(sourceVisible ? 'Hide source boundary' : 'View source boundary');
    setSourceToggleButtonIcon(toggleHost, sourceVisible);

    return card;
};

const mountSourcesList = (container, sources) => {
    if (!container) return;

    sourceVirtualList?.destroy?.();
    sourceVirtualList = helpers.createVirtualList(container, sources, {
        ariaLabel: 'SITREP source hubs',
        chrome: false,
        emptyText: 'No source hubs are listed in this consolidated SITREP.',
        height: Math.max(180, container.clientHeight || 360),
        rowHeight: 128,
        overscan: 4,
        renderItem: (source) => sourceCard(source),
    });
};

const bindSourcesToolbar = (host) => {
    const searchInput = host.querySelector('[data-sources-search]');
    if (searchInput) {
        searchInput.value = sourceFilters.search;
        searchInput.addEventListener('input', () => {
            sourceFilters.search = searchInput.value || '';
            refreshSourcesList();
        });
    }

    const alertSelectHost = host.querySelector('[data-sources-alert-filter]');
    if (alertSelectHost) {
        sourceAlertSelect?.destroy?.();
        sourceAlertSelect = helpers.createSelect(alertSelectHost, [
            { value: 'Normal', label: 'Normal' },
            { value: 'Elevated', label: 'Elevated' },
            { value: 'Critical', label: 'Critical' },
        ], {
            ariaLabel: 'Filter source alert levels',
            placeholder: 'Alert level',
            multiple: true,
            searchable: false,
            closeOnSelect: false,
            clearable: true,
            selected: sourceFilters.alertLevels,
            onChange(values) {
                sourceFilters.alertLevels = Array.isArray(values) ? values : [];
                refreshSourcesList();
            },
        });
    }

    host.querySelector('[data-sources-show-all]')?.addEventListener('click', () => {
        setAllSourcesVisible(true);
    });

    host.querySelector('[data-sources-hide-all]')?.addEventListener('click', () => {
        setAllSourcesVisible(false);
    });
};

const sourcesPanelMarkup = () => `
    <div class="support-sources-panel">
        <div class="support-sources-toolbar" aria-label="Source map visibility actions">
            <div class="support-sources-toolbar-filters">
                <label class="support-sources-search">
                    <span>Search</span>
                    <input type="search" class="ui-input" placeholder="Search sources" data-sources-search>
                </label>
                <label class="support-sources-alert-filter">
                    <span>Alert level</span>
                    <span data-sources-alert-filter></span>
                </label>
            </div>
            <div class="support-sources-toolbar-actions">
                <button type="button" class="support-sources-toolbar-button" data-sources-show-all>Show All</button>
                <button type="button" class="support-sources-toolbar-button" data-sources-hide-all>Hide All</button>
            </div>
        </div>
        <div class="support-sources-list" data-sitrep-sources-list></div>
    </div>
`;

const renderSourcesRail = () => {
    const host = document.querySelector('[data-dashboard-sources-host]');
    if (!host) return;

    sourceVirtualList?.destroy?.();
    sourceVirtualList = null;
    sourceAlertSelect?.destroy?.();
    sourceAlertSelect = null;

    if (state.currentSitrep.loading) {
        host.innerHTML = `
            <div class="support-sources-panel">
                <div class="support-sources-loading" aria-label="Loading source hubs" aria-busy="true">
                    <div class="support-sources-loading-toolbar">
                        <div data-skeleton data-skeleton-lines="1"></div>
                        <div data-skeleton data-skeleton-lines="1"></div>
                    </div>
                    <div class="support-sources-loading-actions">
                        <div data-skeleton data-skeleton-variant="grid" data-skeleton-columns="2" data-skeleton-rows="1"></div>
                    </div>
                    <div class="support-sources-loading-list">
                        ${Array.from({ length: 5 }).map(() => `
                            <article class="support-source-card support-source-card-skeleton">
                                <div data-skeleton data-skeleton-lines="3"></div>
                                <div data-skeleton data-skeleton-lines="2" data-skeleton-class="support-source-card-skeleton-strip"></div>
                            </article>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
        mountLoadingSkeletons(host);
        return;
    }

    if (!state.currentSitrep.available) {
        host.innerHTML = `
            <div class="support-sources-panel">
                <div class="support-sources-rail-placeholder">
                    <p class="ui-eyebrow">Sources</p>
                    <p>Source hubs will appear after consolidation.</p>
                </div>
            </div>
        `;
        return;
    }

    host.innerHTML = sourcesPanelMarkup();
    bindSourcesToolbar(host);
    mountSourcesList(host.querySelector('[data-sitrep-sources-list]'), filteredSources());
};

const renderCurrentSitrepPane = () => {
    const host = document.querySelector('[data-current-sitrep-host]');
    if (!host) return;

    if (state.currentSitrep.loading) {
        host.innerHTML = `
            <div class="support-sitrep-loading" aria-label="Loading current consolidated SITREP" aria-busy="true">
                <header class="support-sitrep-loading-header">
                    <div data-skeleton data-skeleton-lines="2"></div>
                    <div data-skeleton data-skeleton-lines="1" data-skeleton-class="support-sitrep-loading-alert"></div>
                </header>
                <div class="support-sitrep-loading-tabs" data-skeleton data-skeleton-variant="grid" data-skeleton-columns="6" data-skeleton-rows="1"></div>
                <section class="support-sitrep-loading-content">
                    <div data-skeleton data-skeleton-lines="2" data-skeleton-class="support-sitrep-loading-title"></div>
                    <div data-skeleton data-skeleton-lines="5"></div>
                    <div class="support-sitrep-loading-cards" data-skeleton data-skeleton-variant="grid" data-skeleton-columns="3" data-skeleton-rows="2"></div>
                    <div data-skeleton data-skeleton-lines="6"></div>
                </section>
            </div>
        `;
        mountLoadingSkeletons(host);
        return;
    }

    if (!state.currentSitrep.available || !state.currentSitrep.sections.length) {
        host.innerHTML = `
            <div class="support-sitrep-placeholder">
                <p class="ui-eyebrow">No consolidated SITREP yet</p>
                <h2 class="ui-title">Latest consolidated SITREP will appear here.</h2>
                <p>Consolidation runs outside inbound Relay requests on the configured cadence.</p>
            </div>
        `;
        return;
    }

    mountSitrepViewerCss(state.currentSitrep.css);
    const hub = state.currentSitrep.identity || state.hub.data || {};
    const hubName = hub.name || state.hub.data?.name || 'Current SITREP';
    const generatedAt = state.currentSitrep.sitrep?.generated_at || null;
    const subtitle = formatSitrepHeaderDate(generatedAt);
    const tabs = state.currentSitrep.sections;
    const activeSection = tabs.some((section) => section.id === state.currentSitrep.activeSection)
        ? state.currentSitrep.activeSection
        : tabs[0]?.id;
    const active = tabs.find((section) => section.id === activeSection) || tabs[0];
    state.currentSitrep.activeSection = active?.id || 'summary';
    const alertLevel = state.currentSitrep.sitrep?.alert_level || null;

    host.innerHTML = `
        <header class="support-current-sitrep-header">
            <div>
                <h2>${escapeHtml(hubName)}</h2>
                ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
            </div>
            ${alertLevel ? `
                <div class="support-current-sitrep-alert-stack">
                    <div class="support-current-sitrep-alert ${escapeHtml(alertToneClass(alertLevel))}" aria-label="City alert level">
                        <span>Alert</span>
                        <strong>${escapeHtml(titleCase(alertLevel))}</strong>
                    </div>
                    ${generatedAt ? '<div class="support-current-sitrep-generated-elapsed" data-sitrep-generated-elapsed></div>' : ''}
                </div>
            ` : ''}
        </header>
        <nav class="support-current-sitrep-tabs" role="tablist" aria-label="SITREP sections">
            ${tabs.map((section) => `
                <button
                    type="button"
                    role="tab"
                    class="support-current-sitrep-tab${section.id === state.currentSitrep.activeSection ? ' is-active' : ''}"
                    aria-selected="${section.id === state.currentSitrep.activeSection ? 'true' : 'false'}"
                    data-sitrep-section="${escapeHtml(section.id)}"
                >${escapeHtml(section.label)}</button>
            `).join('')}
        </nav>
        <div class="support-current-sitrep-content" role="tabpanel">
            ${active?.html || ''}
        </div>
    `;

    host.querySelector('.support-current-sitrep-header')?.addEventListener('click', () => {
        dashboardMap?.fitBoundary?.({ duration: 650 });
    });

    const generatedElapsedHost = host.querySelector('[data-sitrep-generated-elapsed]');
    if (generatedElapsedHost && generatedAt) {
        helpers.createElapsedTime(generatedElapsedHost, {
            startTime: generatedAt,
            endTime: null,
            running: true,
            format: 'compact',
            size: 'sm',
            variant: 'info',
            chrome: false,
            suffix: ' old',
            showSuffix: true,
            invalidText: 'freshness unknown',
            ariaLabel: 'Current SITREP generated time freshness',
        });
    }

    host.querySelectorAll('[data-sitrep-section]').forEach((button) => {
        button.addEventListener('click', () => {
            state.currentSitrep.activeSection = button.dataset.sitrepSection || 'summary';
            renderCurrentSitrepPane();
        });
    });
};

const loadCurrentSitrep = async () => {
    const host = document.querySelector('[data-current-sitrep-host]');
    if (!host || !state.account) return;

    state.currentSitrep.loading = true;
    renderCurrentSitrepPane();
    renderSourcesRail();

    try {
        const [data, heartbeatData] = await Promise.all([
            api('/api/sitreps/current', {
                reauthOnUnauthorized: false,
            }),
            api('/api/source-heartbeats?hours=48', {
                reauthOnUnauthorized: false,
            }).catch(() => ({ available: false, sources: [] })),
        ]);
        const sourceHeartbeats = Array.isArray(heartbeatData.sources) ? heartbeatData.sources : [];
        state.currentSitrep = {
            loading: false,
            available: Boolean(data.available),
            html: data.html || null,
            css: data.css || null,
            sitrep: data.sitrep || null,
            identity: data.identity || null,
            contextBoundary: data.context_boundary || null,
            sections: Array.isArray(data.sections) ? data.sections : [],
            sources: mergeSourceHeartbeats(Array.isArray(data.sources) ? data.sources : [], sourceHeartbeats),
            sourceHeartbeats,
            activeSection: state.currentSitrep.activeSection || 'summary',
            mapPoints: Array.isArray(data.map_points) ? data.map_points : [],
        };
        dashboardMap?.setIncidents?.(state.currentSitrep.mapPoints);
        await Promise.all([
            syncContextBoundary(),
            syncSourceBoundaries(),
        ]);
        mountDashboardMapControls();
        if (state.currentSitrep.mapPoints.length) {
            dashboardMap?.fitContent?.({ duration: 700 });
        }
    } catch (error) {
        state.currentSitrep = {
            loading: false,
            available: false,
            html: null,
            css: null,
            sitrep: null,
            identity: null,
            contextBoundary: null,
            sections: [],
            sources: [],
            sourceHeartbeats: [],
            activeSection: state.currentSitrep.activeSection || 'summary',
            mapPoints: [],
        };
        dashboardMap?.setIncidents?.([]);
        dashboardMap?.setContextBoundary?.(null);
        dashboardMap?.setSourceBoundaries?.([]);

        if (error?.status === 401 || error?.status === 419) {
            try {
                await syncAuthFromBootstrap();
            } catch {
                state.account = null;
            }

            if (!state.account) {
                state.reauthOpen = false;
                render();
                return;
            }
        }
    }

    renderCurrentSitrepPane();
    renderSourcesRail();
};

const mountDashboardMapControls = () => {
    const host = document.querySelector('[data-dashboard-map-controls]');
    const map = dashboardMap?.getMap?.() ?? null;

    if (!host || !map || !helpers.createMapControls) {
        return;
    }

    dashboardMapControls?.destroy?.();
    dashboardMapControls = helpers.createMapControls(host, {
        map,
        controls: ['zoom', 'compass', 'pitch', 'fit', 'layers'],
        orientation: 'horizontal',
        placement: 'top-right',
        compact: true,
        ariaLabel: 'Support dashboard map controls',
        layers: [
            ...(dashboardMap.hasBoundaryLayer?.() ? [{ id: 'boundary', label: 'Boundary', checked: true }] : []),
            { id: 'incidents', label: 'SITREP points', checked: true },
            ...(dashboardMap.hasTerrainLayer?.() ? [{ id: 'terrain', label: 'Terrain', checked: true }] : []),
            { id: 'poi', label: 'POI', checked: true },
        ],
        onResetNorth: ({ map: controlMap }) => {
            controlMap?.easeTo?.({
                bearing: 0,
                duration: 650,
                essential: true,
            });
        },
        onPitchChange: ({ pitch, map: controlMap }) => {
            controlMap?.easeTo?.({
                pitch,
                duration: 650,
                essential: true,
            });
        },
        onFit: () => {
            if (!dashboardMap.fitContent?.({ duration: 700 })) {
                dashboardMap.fitBoundary?.({ duration: 700 });
            }
        },
        onLayerToggle: ({ layerId, checked }) => {
            dashboardMap.setLayerGroupVisibility?.(layerId, checked);
        },
    });
};

const destroyDashboardMap = () => {
    dashboardMapResizeObserver?.disconnect?.();
    dashboardMapResizeObserver = null;
    dashboardMapControls?.destroy?.();
    dashboardMapControls = null;
    dashboardMap?.destroy?.();
    dashboardMap = null;
};

const mountDashboardMap = () => {
    const container = document.querySelector('[data-dashboard-map-canvas]');

    if (!container) {
        return;
    }

    destroyDashboardMap();
    dashboardMap = createSupportDashboardMap({
        container,
        configUrl: '/support-map.json',
    });

    dashboardMap.init()
        .then(() => {
            if (!dashboardMap.isAvailable?.()) {
                const empty = document.querySelector('[data-dashboard-map-empty]');
                if (empty) {
                    empty.textContent = 'Support map is unavailable.';
                }
                return;
            }

            document.querySelector('[data-dashboard-map-empty]')?.remove();
            dashboardMap.setIncidents(state.currentSitrep.mapPoints || []);
            Promise.all([
                syncContextBoundary(),
                syncSourceBoundaries(),
            ]).then(() => {
                mountDashboardMapControls();
            });
            if (state.currentSitrep.mapPoints?.length) {
                dashboardMap.fitContent?.({ duration: 0 });
            }
            requestAnimationFrame(() => dashboardMap?.resize?.());
            window.setTimeout(() => dashboardMap?.resize?.(), 120);
        })
        .catch(() => {
            const empty = document.querySelector('[data-dashboard-map-empty]');
            if (empty) {
                empty.textContent = 'Support map is unavailable.';
            }
        });

    if (typeof ResizeObserver !== 'undefined') {
        dashboardMapResizeObserver = new ResizeObserver(() => {
            dashboardMap?.resize?.();
        });
        dashboardMapResizeObserver.observe(container);
    }
};

const renderDashboardSplitter = () => {
    const host = document.querySelector('[data-dashboard-splitter]');
    if (!host) return;

    const splitHostWidth = Math.max(1, host.getBoundingClientRect().width || host.clientWidth || 0);
    const sitrepInitialRatio = Math.min(0.48, Math.max(0.22, 500 / splitHostWidth));

    dashboardSplitter?.destroy?.();
    dashboardSplitter = helpers.createSplitter(host, {
        orientation: 'horizontal',
        initialRatio: sitrepInitialRatio,
        minRatio: 0.22,
        maxRatio: 0.48,
        className: 'support-dashboard-splitter',
        paneA: createDashboardPane(
            'is-sitrep',
            '',
            '<div class="support-current-sitrep-host" data-current-sitrep-host></div>',
        ),
        paneB: createDashboardMapPane(),
        onResize: () => {
            dashboardMap?.resize?.();
        },
    });
    mountDashboardMap();
    renderSourcesRail();
    loadCurrentSitrep();
};

const render = () => {
    destroyNavbarClock();
    navbar?.destroy?.();
    navbar = null;
    dashboardSplitter?.destroy?.();
    dashboardSplitter = null;
    destroyDashboardMap();
    root.innerHTML = `
        <div class="app-shell" data-theme="dark">
            <div data-navbar-host></div>
            <main class="app-main">
                ${state.account ? dashboard() : emptyState()}
            </main>
        </div>
    `;
    renderNavbar();
    if (state.account) {
        renderDashboardSplitter();
    }
};

const openLogin = () => {
    loginModal?.destroy?.();
    loginModal = helpers.createLoginFormModal({
        title: 'Login',
        submitLabel: 'Login',
        busyMessage: 'Signing in...',
        identifierKind: 'email',
        identifierLabel: 'Email address',
        identifierPlaceholder: 'name@agency.gov.ph',
        identifierAutocomplete: 'username',
        passwordLabel: 'Password',
        passwordPlaceholder: 'Enter your password',
        fields: {
            identifier: 'email',
            password: 'password',
        },
        async onSubmit(values) {
            try {
                const data = await loginWithCredentials(values);
                applySessionPayload(data);
                state.reauthOpen = false;
                render();
                return true;
            } catch (error) {
                await helpers.uiAlert(firstError(error, 'Invalid email or password.'), {
                    title: 'Login failed',
                    variant: 'error',
                });
                return false;
            }
        },
    });
    loginModal.open();
};

const openReauth = () => {
    if (state.reauthOpen || !state.account) return;
    state.reauthOpen = true;
    reauthModal?.destroy?.();
    reauthModal = helpers.createReauthFormModal({
        title: 'Session Expired',
        message: 'Your session has expired. To continue, please enter your password again.',
        submitLabel: 'Login',
        busyMessage: 'Signing in...',
        identifierKind: 'email',
        identifierLabel: 'Email address',
        identifierValue: state.account.email,
        passwordLabel: 'Password',
        passwordPlaceholder: 'Enter your password',
        fields: {
            identifier: 'email',
            password: 'password',
        },
        async onSubmit(values, ctx) {
            try {
                const data = await loginWithCredentials(values);
                applySessionPayload(data);
                state.reauthOpen = false;
                render();
                return true;
            } catch (error) {
                ctx.setErrors(normalizeErrors(fieldErrors(error)));
                return false;
            }
        },
        onClose() {
            if (state.reauthOpen) {
                window.location.reload();
            }
        },
    });
    reauthModal.open();
};

const openAccount = () => {
    if (!state.account) return;
    accountModal?.destroy?.();
    accountModal = helpers.createAccountFormModal({
        title: 'Account',
        submitLabel: 'Save',
        busyMessage: 'Saving account...',
        nameLabel: 'Full name',
        emailLabel: 'Email address',
        fields: {
            name: 'name',
            email: 'email',
        },
        initialValues: {
            name: state.account.name,
            email: state.account.email,
        },
        extraActionsPlacement: 'start',
        extraActions: [{
            id: 'change-password',
            label: 'Change Password',
            async onClick(values, ctx) {
                await ctx.modal.close({
                    reason: 'action',
                    actionId: 'change-password',
                });
                openPassword();
                return false;
            },
        }],
        async onSubmit(values, ctx) {
            try {
                const data = await api('/api/user', {
                    method: 'POST',
                    body: JSON.stringify(values),
                });
                applySessionPayload(data);
                render();
                return true;
            } catch (error) {
                ctx.setErrors(normalizeErrors(fieldErrors(error)));
                return false;
            }
        },
    });
    accountModal.open();
};

const openPassword = () => {
    if (!state.account) return;
    passwordModal?.destroy?.();
    passwordModal = helpers.createChangePasswordFormModal({
        title: 'Change Password',
        submitLabel: 'Save',
        busyMessage: 'Updating password...',
        fields: {
            currentPassword: 'current_password',
            newPassword: 'password',
            confirmPassword: 'password_confirmation',
        },
        async onSubmit(values, ctx) {
            try {
                await api('/api/user/password', {
                    method: 'POST',
                    body: JSON.stringify(values),
                });
                return true;
            } catch (error) {
                ctx.setErrors(normalizeErrors(fieldErrors(error)));
                return false;
            }
        },
    });
    passwordModal.open();
};

const closeSupportRequests = () => {
    supportRequestsVirtualList?.destroy?.();
    supportRequestsVirtualList = null;
    supportRequestsModal?.destroy?.();
    supportRequestsModal = null;
    selectedSupportRequestId = null;
};

const resetSupportRequestsCache = () => {
    supportRequestsData = [];
    supportRequestsLoaded = false;
    supportRequestsLoading = false;
};

const supportRequestStatusLabel = (status) => titleCase(status || 'requested');

const supportRequestTime = (value) => formatSitrepHeaderDate(value) || 'Time unavailable';

const supportRequestOptionalTime = (value) => formatSitrepHeaderDate(value) || '';

const supportRequestPlainValue = (value) => {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value) || typeof value === 'object') {
        return JSON.stringify(value, null, 2);
    }

    return String(value).trim();
};

const supportRequestJsonSummary = (value, fallback = '') => {
    if (!value || typeof value !== 'object') {
        return fallback;
    }

    const candidates = [
        value.title,
        value.label,
        value.name,
        value.path,
        value.gap_id,
        value.id,
        value.incident_id,
    ].map((item) => String(item ?? '').trim()).filter(Boolean);

    return candidates[0] || fallback;
};

const supportRequestSourceLabel = (request) => [
    request?.source_hub_name,
    request?.source_relay_hub_id,
    request?.source_hub_id,
].map((item) => String(item ?? '').trim()).filter(Boolean).join(' / ') || 'Unknown source';

const supportRequestQuantityLabel = (request) => {
    if (request?.quantity === null || request?.quantity === undefined || request?.quantity === '') {
        return '';
    }

    return `${request.quantity} ${request.quantity_unit || ''}`.trim();
};

const sortSupportRequestsForDisplay = () => {
    supportRequestsData.sort((a, b) => {
        const aTime = Date.parse(a?.requested_at || a?.created_at || '') || 0;
        const bTime = Date.parse(b?.requested_at || b?.created_at || '') || 0;
        if (aTime !== bTime) return bTime - aTime;

        return String(a?.source_hub_name || '').localeCompare(String(b?.source_hub_name || ''), undefined, {
            sensitivity: 'base',
        });
    });
};

const upsertCachedSupportRequest = (request) => {
    if (!request?.id) return false;

    const id = String(request.id);
    const index = supportRequestsData.findIndex((item) => String(item?.id) === id);
    if (index >= 0) {
        supportRequestsData[index] = { ...supportRequestsData[index], ...request };
    } else {
        supportRequestsData.push(request);
    }

    sortSupportRequestsForDisplay();
    supportRequestsLoaded = true;
    refreshSupportRequestsList();
    return true;
};

const filteredSupportRequests = () => {
    const search = supportRequestFilters.search.trim().toLowerCase();
    if (!search) {
        return supportRequestsData;
    }

    return supportRequestsData.filter((request) => [
        request?.support_request_id,
        request?.local_request_id,
        request?.source_hub_name,
        request?.requested_assistance,
        request?.requested_capability,
        request?.urgency,
        request?.status,
        request?.requester?.display_name,
    ].some((value) => String(value || '').toLowerCase().includes(search)));
};

const refreshSupportRequestsList = () => {
    renderSupportRequestsList(filteredSupportRequests());
};

const supportRequestListLoadingMarkup = () => `
    <div class="support-requests-loading" aria-label="Loading support requests" aria-busy="true">
        ${Array.from({ length: 4 }).map(() => `
            <article class="support-request-card support-request-card-skeleton">
                <div data-skeleton data-skeleton-lines="3"></div>
                <div data-skeleton data-skeleton-lines="1" data-skeleton-class="support-request-card-skeleton-strip"></div>
            </article>
        `).join('')}
    </div>
`;

const supportRequestEmptyState = (title, message = '') => `
    <div class="support-requests-empty">
        <strong>${escapeHtml(title)}</strong>
        ${message ? `<span>${escapeHtml(message)}</span>` : ''}
    </div>
`;

const setSupportRequestsRefreshBusy = (busy) => {
    supportRequestsModal?.setHeaderActionState?.('refresh-requests', { busy });
};

const supportRequestsModalShell = () => {
    const drawer = helpers.createDrawer({
        title: supportRequestsLoaded
            ? `${supportRequestsData.length} ${supportRequestsData.length === 1 ? 'request' : 'requests'}`
            : 'Loading requests...',
        position: 'right',
        panelClass: 'support-requests-drawer',
        bodyClass: 'support-requests-drawer-body',
        closeLabel: 'Close requests',
        headerActions: [{
            id: 'refresh-requests',
            label: 'Refresh requests',
            icon: 'actions.refresh',
            tone: 'quiet',
            busy: supportRequestsLoading,
            onClick(_action, _event, drawerApi) {
                drawerApi?.setHeaderActionState?.('refresh-requests', { busy: true });
                loadSupportRequests({ force: true });
            },
        }],
        onClose() {
            supportRequestsVirtualList?.destroy?.();
            supportRequestsVirtualList = null;
            supportRequestsModal = null;
            selectedSupportRequestId = null;
        },
    });

    drawer.body.innerHTML = `
        <div class="support-requests-modal-toolbar">
            <label class="support-requests-search">
                <input type="search" class="ui-input" placeholder="Search requests" data-support-requests-search>
            </label>
        </div>
        <div class="support-requests-list" data-support-requests-list>
            ${supportRequestListLoadingMarkup()}
        </div>
        <section class="support-request-detail" data-support-request-detail aria-live="polite">
            ${supportRequestEmptyState('Select a request', 'Details, context, and lifecycle history will appear here.')}
        </section>
    `;
    mountLoadingSkeletons(drawer.body);

    const searchInput = drawer.body.querySelector('[data-support-requests-search]');
    if (searchInput) {
        searchInput.value = supportRequestFilters.search;
        searchInput.addEventListener('input', () => {
            supportRequestFilters.search = searchInput.value || '';
            refreshSupportRequestsList();
        });
    }

    return drawer;
};

const supportRequestStatusClass = (status) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'requested') return 'is-requested';
    if (normalized === 'received' || normalized === 'under_review') return 'is-received';
    if (normalized === 'accepted' || normalized === 'assigned' || normalized === 'en_route') return 'is-active';
    if (normalized === 'rejected' || normalized === 'cancelled') return 'is-closed';
    if (normalized === 'fulfilled' || normalized === 'closed') return 'is-complete';
    return '';
};

const supportRequestCard = (request) => {
    const card = document.createElement('article');
    card.className = `support-request-card ${supportRequestStatusClass(request?.status)}${String(request?.id) === String(selectedSupportRequestId) ? ' is-selected' : ''}`.trim();
    card.dataset.supportRequestId = String(request?.id || '');
    card.tabIndex = 0;

    const quantity = supportRequestQuantityLabel(request);
    const source = supportRequestSourceLabel(request);
    const capability = request?.requested_capability ? titleCase(request.requested_capability) : '';
    const assistance = request?.requested_assistance || capability || 'Support request';
    const requestedAt = supportRequestOptionalTime(request?.requested_at);
    card.innerHTML = `
        <div class="support-request-card-main">
            <div class="support-request-card-topline">
                <strong>${escapeHtml(source)}</strong>
                <span class="support-request-status ${supportRequestStatusClass(request?.status)}">${escapeHtml(supportRequestStatusLabel(request?.status))}</span>
            </div>
            <span class="support-request-card-assistance">${escapeHtml(assistance)}</span>
            <span class="support-request-meta">${escapeHtml([
                request?.urgency ? titleCase(request.urgency) : '',
                quantity,
                requestedAt,
            ].filter(Boolean).join(' - '))}</span>
        </div>
    `;
    card.addEventListener('click', () => openSupportRequestDetail(request?.id));
    card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openSupportRequestDetail(request?.id);
        }
    });

    return card;
};

const renderSupportRequestsList = (requests = []) => {
    const list = supportRequestsModal?.body?.querySelector?.('[data-support-requests-list]');
    if (!list) return;

    if (supportRequestsModal?.title) {
        const total = supportRequestsData.length;
        supportRequestsModal.title.textContent = supportRequestFilters.search.trim()
            ? `${requests.length} of ${total} ${total === 1 ? 'request' : 'requests'}`
            : `${total} ${total === 1 ? 'request' : 'requests'}`;
    }

    supportRequestsVirtualList?.destroy?.();
    supportRequestsVirtualList = helpers.createVirtualList(list, requests, {
        ariaLabel: 'Support requests',
        chrome: false,
        emptyText: supportRequestFilters.search.trim() ? 'No requests match this search.' : 'No approved support requests have arrived yet.',
        height: Math.max(220, list.clientHeight || 360),
        rowHeight: 118,
        overscan: 4,
        renderItem: (request) => supportRequestCard(request),
    });
};

const loadSupportRequests = async ({ force = false } = {}) => {
    const list = supportRequestsModal?.body?.querySelector?.('[data-support-requests-list]');
    if (supportRequestsLoaded && !force) {
        renderSupportRequestsList(filteredSupportRequests());
        return;
    }

    if (list) {
        supportRequestsVirtualList?.destroy?.();
        supportRequestsVirtualList = null;
        list.innerHTML = supportRequestListLoadingMarkup();
        mountLoadingSkeletons(list);
    }

    supportRequestsLoading = true;
    setSupportRequestsRefreshBusy(true);
    try {
        const data = await api('/api/support-requests');
        supportRequestsData = Array.isArray(data.requests) ? data.requests : [];
        sortSupportRequestsForDisplay();
        supportRequestsLoaded = true;
        renderSupportRequestsList(filteredSupportRequests());
    } catch (error) {
        if (list) {
            list.innerHTML = supportRequestEmptyState('Unable to load requests', firstError(error, 'Unable to load support requests.'));
        }
    } finally {
        supportRequestsLoading = false;
        setSupportRequestsRefreshBusy(false);
    }
};

const supportRequestDetailRow = (label, value) => {
    const text = supportRequestPlainValue(value);

    if (!text) return '';

    return `
        <div class="support-request-detail-row">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(text)}</strong>
        </div>
    `;
};

const supportRequestDeliveryLabel = (request) => {
    const delivery = request?.latest_update_delivery || (Array.isArray(request?.update_deliveries) ? request.update_deliveries[0] : null);
    if (!delivery) return '';

    const state = delivery.delivery_status ? titleCase(delivery.delivery_status) : 'Pending';
    const type = delivery.message_type || 'support.request update';
    const attempts = Number.isFinite(Number(delivery.attempt_count)) ? `attempts ${Number(delivery.attempt_count)}` : '';
    const submitted = delivery.submitted_at ? `sent ${supportRequestTime(delivery.submitted_at)}` : '';
    const error = delivery.last_error ? `error: ${delivery.last_error}` : '';

    return [state, type, attempts, submitted, error].filter(Boolean).join(' - ');
};

const supportRequestDetailSection = (title, content, className = '') => {
    if (!content) return '';

    return `
        <section class="support-request-detail-section ${escapeHtml(className)}">
            <h4>${escapeHtml(title)}</h4>
            ${content}
        </section>
    `;
};

const supportRequestContextBlock = (label, value) => {
    const text = supportRequestPlainValue(value);
    if (!text) return '';

    const summary = supportRequestJsonSummary(value);

    return `
        <div class="support-request-context-block">
            <div>
                <span>${escapeHtml(label)}</span>
                ${summary ? `<strong>${escapeHtml(summary)}</strong>` : ''}
            </div>
            <pre>${escapeHtml(text)}</pre>
        </div>
    `;
};

const supportRequestMessageLabel = (messageType) => titleCase(String(messageType || 'Relay message').replace(/\./g, ' '));

const supportRequestLifecycleItems = (request) => {
    const events = [];

    if (request?.requested_at) {
        events.push({
            label: 'Requested',
            at: request.requested_at,
            detail: [request.source_system, request.local_request_id].filter(Boolean).join(' - '),
        });
    }

    if (request?.intake_received_at) {
        events.push({
            label: 'Intake accepted',
            at: request.intake_received_at,
            detail: request.relay_message_id || 'Relay intake recorded',
        });
    }

    if (request?.received_at) {
        events.push({
            label: 'Human review acknowledged',
            at: request.received_at,
            detail: request.received_by_user_id ? `User #${request.received_by_user_id}` : 'Support operator',
        });
    }

    const messages = Array.isArray(request?.lifecycle_history) ? request.lifecycle_history : [];
    messages.forEach((message) => {
        events.push({
            label: supportRequestMessageLabel(message.message_type),
            at: message.processed_at || message.created_at,
            detail: [
                message.direction,
                message.validation_status ? titleCase(message.validation_status) : '',
                message.relay_message_id,
            ].filter(Boolean).join(' - '),
            errors: message.validation_errors,
        });
    });

    return events
        .filter((event) => event.label || event.at || event.detail)
        .sort((a, b) => (Date.parse(a.at || '') || 0) - (Date.parse(b.at || '') || 0));
};

const supportRequestLifecycleMarkup = (request) => {
    const events = supportRequestLifecycleItems(request);
    if (!events.length) {
        return supportRequestEmptyState('No lifecycle history yet', 'Relay and operator events will appear here when available.');
    }

    return `
        <ol class="support-request-timeline">
            ${events.map((event) => `
                <li>
                    <div>
                        <strong>${escapeHtml(event.label)}</strong>
                        <span>${escapeHtml(supportRequestOptionalTime(event.at) || 'Time unavailable')}</span>
                    </div>
                    ${event.detail ? `<p>${escapeHtml(event.detail)}</p>` : ''}
                    ${event.errors ? `<pre>${escapeHtml(supportRequestPlainValue(event.errors))}</pre>` : ''}
                </li>
            `).join('')}
        </ol>
    `;
};

const supportRequestDetailLoadingMarkup = () => `
    <div class="support-request-detail-loading" aria-label="Loading support request detail" aria-busy="true">
        <div data-skeleton data-skeleton-lines="3"></div>
        <div data-skeleton data-skeleton-variant="grid" data-skeleton-columns="2" data-skeleton-rows="3"></div>
        <div data-skeleton data-skeleton-lines="5"></div>
        <div data-skeleton data-skeleton-lines="4"></div>
    </div>
`;

const renderSupportRequestDetail = (request) => {
    const detail = supportRequestsModal?.body?.querySelector?.('[data-support-request-detail]');
    if (!detail) return;

    if (!request) {
        detail.innerHTML = supportRequestEmptyState('Select a request', 'Details, context, and lifecycle history will appear here.');
        return;
    }

    const quantity = supportRequestQuantityLabel(request);
    const source = supportRequestSourceLabel(request);
    const capability = request.requested_capability ? titleCase(request.requested_capability) : '';
    const requester = [
        request.requester?.display_name,
        request.requester?.role ? titleCase(request.requester.role) : '',
        request.requester?.user_id,
    ].filter(Boolean).join(' - ');
    const operatorNotes = [
        supportRequestDetailRow('Staging notes', request.staging_notes),
        supportRequestDetailRow('Command notes', request.command_notes),
    ].join('');
    const contextMarkup = [
        supportRequestContextBlock('SITREP context', request.sitrep_context),
        supportRequestContextBlock('Gap context', request.gap_context),
        supportRequestContextBlock('Evidence context', request.evidence_row),
        supportRequestContextBlock('Incident refs', request.incident_refs),
    ].join('');
    detail.innerHTML = `
        <header class="support-request-detail-header">
            <div class="support-request-detail-kicker">
                <span class="support-request-status ${supportRequestStatusClass(request.status)}">${escapeHtml(supportRequestStatusLabel(request.status))}</span>
                ${request.urgency ? `<span class="support-request-urgency">${escapeHtml(titleCase(request.urgency))}</span>` : ''}
            </div>
            <h3>${escapeHtml(request.requested_assistance || capability || 'Support request')}</h3>
            <p>${escapeHtml(source)}</p>
        </header>
        ${supportRequestDetailSection('Request', `
            <div class="support-request-detail-grid">
                ${supportRequestDetailRow('Status', supportRequestStatusLabel(request.status))}
                ${supportRequestDetailRow('Source barangay / hub', source)}
                ${supportRequestDetailRow('Urgency', request.urgency ? titleCase(request.urgency) : '')}
                ${supportRequestDetailRow('Requested assistance', request.requested_assistance)}
                ${supportRequestDetailRow('Capability', capability)}
                ${supportRequestDetailRow('Quantity', quantity)}
                ${supportRequestDetailRow('Requester', requester)}
                ${supportRequestDetailRow('Requested at', supportRequestTime(request.requested_at))}
                ${supportRequestDetailRow('Received at', supportRequestOptionalTime(request.received_at) || 'Not yet acknowledged')}
                ${supportRequestDetailRow('Hotline update', supportRequestDeliveryLabel(request))}
            </div>
        `)}
        ${supportRequestDetailSection('Operator Notes', operatorNotes ? `<div class="support-request-detail-grid">${operatorNotes}</div>` : supportRequestEmptyState('No operator notes attached'))}
        ${supportRequestDetailSection('SITREP And Gap Context', contextMarkup || supportRequestEmptyState('No context attached'))}
        ${supportRequestDetailSection('Lifecycle History', supportRequestLifecycleMarkup(request), 'is-history')}
    `;
};

const openSupportRequestDetail = async (requestId) => {
    const id = String(requestId || '');
    if (!id) return;

    const detail = supportRequestsModal?.body?.querySelector?.('[data-support-request-detail]');
    selectedSupportRequestId = id;
    refreshSupportRequestsList();
    if (detail) {
        detail.innerHTML = supportRequestDetailLoadingMarkup();
        mountLoadingSkeletons(detail);
    }

    try {
        const data = await api(`/api/support-requests/${encodeURIComponent(id)}/receive`, {
            method: 'POST',
            body: '{}',
        });
        if (data.request) {
            upsertCachedSupportRequest(data.request);
            renderSupportRequestDetail(data.request);
        }
    } catch (error) {
        if (detail) {
            detail.innerHTML = supportRequestEmptyState('Unable to load request details', firstError(error, 'Unable to load request details.'));
        }
    }
};

const openSupportRequests = async () => {
    if (!state.account || state.reauthOpen) return;

    closeSupportRequests();
    selectedSupportRequestId = null;
    supportRequestsModal = supportRequestsModalShell();
    supportRequestsModal.open(document.body);
    await loadSupportRequests();
};

const closeUsers = () => {
    usersVirtualList?.destroy?.();
    usersVirtualList = null;
    usersModal?.destroy?.();
    usersModal = null;
};

const resetUsersCache = () => {
    usersListData = [];
    usersListLoaded = false;
    usersListLoading = false;
};

const sortUsersForDisplay = () => {
    usersListData.sort((a, b) => {
        const nameCompare = String(a?.name || '').localeCompare(String(b?.name || ''), undefined, {
            sensitivity: 'base',
        });
        if (nameCompare !== 0) return nameCompare;

        return String(a?.email || '').localeCompare(String(b?.email || ''), undefined, {
            sensitivity: 'base',
        });
    });
};

const upsertCachedUser = (user) => {
    if (!user?.id) return false;

    const id = String(user.id);
    const index = usersListData.findIndex((item) => String(item?.id) === id);
    if (index >= 0) {
        usersListData[index] = user;
    } else {
        usersListData.push(user);
    }

    sortUsersForDisplay();
    usersListLoaded = true;
    refreshUsersList();
    return true;
};

const removeCachedUser = (userId) => {
    const id = String(userId || '');
    const nextUsers = usersListData.filter((item) => String(item?.id) !== id);
    if (nextUsers.length === usersListData.length) return false;

    usersListData = nextUsers;
    usersListLoaded = true;
    refreshUsersList();
    return true;
};

const userRoleLabel = (role) => role === 'admin' ? 'Admin' : 'Operator';

const filteredUsers = () => {
    const search = userFilters.search.trim().toLowerCase();
    if (!search) {
        return usersListData;
    }

    return usersListData.filter((user) => [
        user?.name,
        user?.email,
        user?.role,
    ].some((value) => String(value || '').toLowerCase().includes(search)));
};

const refreshUsersList = () => {
    renderUsersList(filteredUsers());
};

const setUsersRefreshBusy = (busy) => {
    usersModal?.setHeaderActionState?.('refresh-users', { busy });
};

const usersModalShell = () => {
    const drawer = helpers.createDrawer({
        title: 'Users',
        position: 'right',
        panelClass: 'support-users-drawer',
        bodyClass: 'support-users-drawer-body',
        closeLabel: 'Close users',
        headerActions: [{
            id: 'refresh-users',
            label: 'Refresh users',
            icon: 'actions.refresh',
            tone: 'quiet',
            busy: usersListLoading,
            onClick(_action, _event, drawerApi) {
                drawerApi?.setHeaderActionState?.('refresh-users', { busy: true });
                loadUsers({ force: true });
            },
        }],
        onClose() {
            usersVirtualList?.destroy?.();
            usersVirtualList = null;
            usersModal = null;
        },
    });
    if (drawer.title) {
        drawer.title.dataset.usersCount = '';
        drawer.title.textContent = usersListLoaded ? `${usersListData.length} ${usersListData.length === 1 ? 'user' : 'users'}` : 'Loading users...';
    }

    drawer.body.innerHTML = `
        <div class="support-users-modal-toolbar">
            <div class="support-users-toolbar-main">
                <label class="support-users-search">
                    <input type="search" class="ui-input" placeholder="Search users" data-users-search>
                </label>
            </div>
            <button type="button" class="support-users-primary-button" data-users-create>Add User</button>
        </div>
        <div class="support-users-list" data-users-list>
            <div class="support-users-empty">Loading users...</div>
        </div>
    `;

    drawer.body.querySelector('[data-users-create]')?.addEventListener('click', () => {
        openUserEditor();
    });

    const searchInput = drawer.body.querySelector('[data-users-search]');
    if (searchInput) {
        searchInput.value = userFilters.search;
        searchInput.addEventListener('input', () => {
            userFilters.search = searchInput.value || '';
            refreshUsersList();
        });
    }

    return drawer;
};

const userCard = (user) => {
    const card = document.createElement('article');
    card.className = 'support-user-card';
    card.dataset.userId = String(user?.id || '');

    const main = document.createElement('div');
    main.className = 'support-user-card-main';

    const name = document.createElement('strong');
    name.textContent = user?.name || user?.email || 'Unnamed user';
    const meta = document.createElement('span');
    meta.className = 'support-user-meta';
    meta.textContent = `${userRoleLabel(user?.role)} - ${user?.email || ''}`;
    main.append(name, meta);

    const actions = document.createElement('div');
    actions.className = 'support-user-card-actions';

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'support-users-icon-action';
    editButton.innerHTML = icons.edit;
    editButton.setAttribute('aria-label', `Edit ${user?.name || user?.email || 'user'}`);
    editButton.setAttribute('title', 'Edit user');
    editButton.addEventListener('click', () => openUserEditor(user));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'support-users-icon-action is-danger';
    deleteButton.innerHTML = icons.trash;
    deleteButton.setAttribute('aria-label', `Delete ${user?.name || user?.email || 'user'}`);
    deleteButton.setAttribute('title', 'Delete user');
    deleteButton.disabled = String(user?.id) === String(state.account?.id);
    if (deleteButton.disabled) {
        deleteButton.setAttribute('title', 'You cannot delete your own account');
    }
    deleteButton.addEventListener('click', async () => {
        if (deleteButton.disabled) return;

        const confirmed = await helpers.uiConfirm(`Delete ${user.name || user.email}?`, {
            title: 'Delete User',
            variant: 'danger',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            confirmVariant: 'danger',
            showCloseButton: true,
        });

        if (!confirmed) {
            return;
        }

        try {
            await api(`/api/admin/users/${encodeURIComponent(user.id)}`, {
                method: 'DELETE',
            });
            if (!removeCachedUser(user.id)) {
                await loadUsers({ force: true });
            }
        } catch (error) {
            await helpers.uiAlert(firstError(error, 'Unable to delete user.'), {
                title: 'Delete failed',
                variant: 'error',
            });
        }
    });

    actions.append(editButton, deleteButton);
    card.append(main, actions);

    return card;
};

const renderUsersList = (users = []) => {
    const list = usersModal?.body?.querySelector?.('[data-users-list]');
    const count = usersModal?.body
        ?.closest?.('.support-users-drawer')
        ?.querySelector?.('[data-users-count]');
    if (!list) return;

    if (count) {
        const total = usersListData.length;
        count.textContent = userFilters.search.trim()
            ? `${users.length} of ${total} ${total === 1 ? 'user' : 'users'}`
            : `${total} ${total === 1 ? 'user' : 'users'}`;
    }

    usersVirtualList?.destroy?.();
    usersVirtualList = helpers.createVirtualList(list, users, {
        ariaLabel: 'Support users',
        chrome: false,
        emptyText: userFilters.search.trim() ? 'No users match this search.' : 'No users found.',
        height: Math.max(260, list.clientHeight || 520),
        rowHeight: 98,
        overscan: 4,
        renderItem: (user) => userCard(user),
    });
};

const loadUsers = async ({ force = false } = {}) => {
    const list = usersModal?.body?.querySelector?.('[data-users-list]');
    if (usersListLoaded && !force) {
        renderUsersList(filteredUsers());
        return;
    }

    if (list) {
        usersVirtualList?.destroy?.();
        usersVirtualList = null;
        list.innerHTML = '<div class="support-users-empty">Loading users...</div>';
    }

    usersListLoading = true;
    setUsersRefreshBusy(true);
    try {
        const data = await api('/api/admin/users');
        usersListData = Array.isArray(data.users) ? data.users : [];
        usersListLoaded = true;
        renderUsersList(filteredUsers());
    } catch (error) {
        if (list) {
            list.innerHTML = `<div class="support-users-empty">${escapeHtml(firstError(error, 'Unable to load users.'))}</div>`;
        }
    } finally {
        usersListLoading = false;
        setUsersRefreshBusy(false);
    }
};

const openUsers = async () => {
    if (state.account?.role !== 'admin') return;

    closeUsers();
    usersModal = usersModalShell();
    usersModal.open(document.body);
    await loadUsers();
};

const openUserEditor = (user = null) => {
    if (state.account?.role !== 'admin') return;

    const editing = Boolean(user);
    const modal = helpers.createAccountFormModal({
        title: editing ? 'Edit User' : 'Add User',
        submitLabel: editing ? 'Save' : 'Add User',
        busyMessage: editing ? 'Saving user...' : 'Creating user...',
        size: 'sm',
        className: 'support-user-form-modal',
        nameLabel: 'Full name',
        emailLabel: 'Email address',
        fields: {
            name: 'name',
            email: 'email',
        },
        initialValues: {
            name: user?.name || '',
            email: user?.email || '',
            role: user?.role || 'operator',
            password: '',
        },
        extraRows: [
            [
                {
                    type: 'select',
                    name: 'role',
                    label: 'Role',
                    options: [
                        { value: 'operator', label: 'Operator' },
                        { value: 'admin', label: 'Admin' },
                    ],
                    required: true,
                },
            ],
            [
                {
                    type: 'input',
                    input: 'password',
                    name: 'password',
                    label: editing ? 'New password' : 'Password',
                    help: editing ? 'Leave blank to keep the current password.' : '',
                    required: !editing,
                    autocomplete: 'new-password',
                },
            ],
        ],
        async onSubmit(values, ctx) {
            try {
                const data = await api(editing ? `/api/admin/users/${encodeURIComponent(user.id)}` : '/api/admin/users', {
                    method: 'POST',
                    body: JSON.stringify({
                        name: values.name,
                        email: values.email,
                        role: values.role,
                        password: values.password || '',
                    }),
                });
                if (!upsertCachedUser(data.user)) {
                    await loadUsers({ force: true });
                }
                return true;
            } catch (error) {
                ctx.setErrors(normalizeErrors(fieldErrors(error)));
                if (!Object.keys(fieldErrors(error)).length) {
                    await helpers.uiAlert(firstError(error, 'Unable to save user.'), {
                        title: 'Save failed',
                        variant: 'error',
                    });
                }
                return false;
            }
        },
    });

    modal.open();
};

const openSettings = () => {
    if (state.account?.role !== 'admin') return;

    settingsModal?.destroy?.();
    settingsModal = helpers.createFormModal({
        title: 'Settings',
        submitLabel: 'Save',
        busyMessage: 'Saving settings...',
        size: 'md',
        className: 'support-settings-form-modal',
        initialValues: {
            alert_level: state.settings.alertLevel || 'Normal',
            sitrep_cadence: state.settings.consolidationCadenceMinutes || 15,
            relay_url: state.settings.relayUrl || 'https://relay.pbb.ph',
            relay_token: state.settings.relayToken || '',
            relay_handler_token: state.settings.relayHandlerToken || '',
            realtime_url: state.settings.realtimeUrl || 'https://realtime.pbb.ph',
            realtime_client_code: state.settings.realtimeClientCode || '',
            server_project_code: state.settings.serverProjectCode || '',
            admin_project_code: state.settings.adminProjectCode || '',
            realtime_backend_ingress_secret: state.settings.realtimeBackendIngressSecret || '',
        },
        rows: [
            [
                {
                    type: 'select',
                    name: 'alert_level',
                    label: 'Alert level',
                    required: true,
                    options: [
                        { value: 'Normal', label: 'Normal' },
                        { value: 'Elevated', label: 'Elevated' },
                        { value: 'Critical', label: 'Critical' },
                    ],
                },
                {
                    type: 'input',
                    input: 'number',
                    name: 'sitrep_cadence',
                    label: 'SITREP cadence (in minutes)',
                    required: true,
                    min: 1,
                    step: 1,
                    placeholder: '15',
                },
            ],
            [
                {
                    type: 'input',
                    input: 'url',
                    name: 'relay_url',
                    label: 'Relay URL',
                    required: true,
                    placeholder: 'https://relay.pbb.ph',
                },
            ],
            [
                {
                    type: 'input',
                    input: 'password',
                    name: 'relay_token',
                    label: 'Relay token',
                    placeholder: 'Enter Relay token',
                },
            ],
            [
                {
                    type: 'input',
                    input: 'password',
                    name: 'relay_handler_token',
                    label: 'Relay handler token',
                    placeholder: 'Enter Relay handler token',
                },
            ],
            [
                {
                    type: 'input',
                    input: 'url',
                    name: 'realtime_url',
                    label: 'Realtime URL',
                    required: true,
                    placeholder: 'https://realtime.pbb.ph',
                },
            ],
            [
                {
                    type: 'input',
                    input: 'password',
                    name: 'realtime_client_code',
                    label: 'Realtime client code',
                    placeholder: 'Enter Realtime client code',
                },
            ],
            [
                {
                    type: 'input',
                    input: 'password',
                    name: 'server_project_code',
                    label: 'Server Project Code',
                    placeholder: 'Enter Server Project Code',
                },
            ],
            [
                {
                    type: 'input',
                    input: 'password',
                    name: 'admin_project_code',
                    label: 'Admin Project Code',
                    placeholder: 'Enter Admin Project Code',
                },
            ],
            [
                {
                    type: 'input',
                    input: 'password',
                    name: 'realtime_backend_ingress_secret',
                    label: 'Realtime Backend Ingress Secret',
                    placeholder: 'Enter Realtime Backend Ingress Secret',
                },
            ],
        ],
        async onSubmit(values) {
            const data = await api('/api/settings', {
                method: 'POST',
                body: JSON.stringify(values),
            });

            state.settings = {
                ...state.settings,
                ...(data.settings || {}),
            };
            markServerTouch(data);
            renderNavbar();

            return true;
        },
    });
    settingsModal.open();
};

const logout = async () => {
    const data = await api('/api/logout', { method: 'POST', body: '{}' });
    closeSupportRequests();
    resetSupportRequestsCache();
    closeUsers();
    resetUsersCache();
    setSessionRemembered(false);
    applySessionPayload(data);
    state.account = null;
    state.reauthOpen = false;
    render();
};

document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'login') {
        openLogin();
    }
});

const shouldKeepalive = () => {
    if (!state.account || state.reauthOpen || state.keepaliveInFlight) return false;

    const sessionAgeMs = now() - state.lastServerTouchAt;
    const lifetimeMs = Math.max(60 * 1000, state.sessionLifetimeMinutes * 60 * 1000);
    const nearExpiryMs = Math.min(
        5 * 60 * 1000,
        Math.max(60 * 1000, lifetimeMs * 0.2),
    );
    const dueMs = Math.max(
        60 * 1000,
        Math.min(KEEPALIVE_MAX_CADENCE_MS, lifetimeMs - nearExpiryMs),
    );

    return sessionAgeMs >= dueMs;
};

const requestSessionKeepalive = async ({ force = false } = {}) => {
    if ((!force && !shouldKeepalive()) || !state.account || state.reauthOpen || state.keepaliveInFlight) {
        return false;
    }
    state.keepaliveInFlight = true;

    try {
        const data = await api('/api/session/ping');
        applySessionPayload(data);
        return true;
    } catch {
        // api() opens the re-auth modal for session failures.
        return false;
    } finally {
        state.keepaliveInFlight = false;
    }
};

setInterval(() => {
    requestSessionKeepalive();
}, KEEPALIVE_CHECK_INTERVAL_MS);

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        requestSessionKeepalive();
    }
});

window.addEventListener('focus', () => {
    requestSessionKeepalive();
});

const bootstrap = async () => {
    await syncAuthFromBootstrap();
    render();
};

bootstrap().catch(() => {
    render();
});
