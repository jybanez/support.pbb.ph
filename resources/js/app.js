import './bootstrap';
import { createSupportDashboardMap } from './maps/supportDashboardMap.js';
import { mergeHeartbeatCache, mergeSourceHeartbeats } from './sourceHeartbeats.js';
import { RealtimeSocketClient } from './vendor/pbb-realtime-sdk/index.js';

const root = document.getElementById('app');
const csrfMeta = document.querySelector('meta[name="csrf-token"]');
const helperLoaderUrl = '/vendor/helpers.pbb.ph/js/ui/ui.loader.js';
const APP_ICON_URL = '/assets/launcher/app-icon.png';
const LOGIN_BACKGROUND_IMAGE_URL = '';
const LOGIN_EMAIL_STORAGE_KEY = 'pbb.support.login.email';
const ACCOUNT_SSO_ERROR_PARAM = 'account_sso_error';
const accountSsoErrorOnLoad = new URLSearchParams(window.location.search).has(ACCOUNT_SSO_ERROR_PARAM);
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
    'ui.navigation.stack',
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
    createNavigationStack: await uiLoader.get('ui.navigation.stack', { ...helperLoadOptions, preferBundles: false }),
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
        accountSso: {
            enabled: false,
            ready: false,
            loginUrl: '/auth/account/redirect',
            logoutUrl: '/auth/logout',
            baseUrl: 'https://account.pbb.ph',
        },
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
        sitrepRelayToken: '',
        supportRequestRelayToken: '',
        relayHandlerToken: '',
        realtimeUrl: 'https://realtime.pbb.ph',
        realtimeClientCode: '',
        serverProjectCode: '',
        adminProjectCode: '',
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
        sourceHeartbeatsLoading: false,
        activeSection: 'summary',
        mapPoints: [],
        mediaRefs: [],
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
let sourceHeartbeatRealtimeClient = null;
let sourceHeartbeatRealtimeConnecting = false;
let sourceHeartbeatRealtimeEventType = 'support.source_heartbeats.updated';
let currentSitrepStyleMounted = false;
let currentSitrepLoadId = 0;
let sourceVirtualList = null;
let sourcesNavigationStack = null;
let activeSourceDetailId = null;
const sourceDetailVirtualLists = new Map();
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
let supportRequestActionBusy = false;
const userFilters = {
    search: '',
};
const supportRequestFilters = {
    search: '',
};

const supportRequestFlow = [
    { status: 'requested', label: 'Requested' },
    { status: 'received', label: 'Received' },
    { status: 'accepted', label: 'Accepted' },
    { status: 'assigned', label: 'Assigned' },
    { status: 'en_route', label: 'En Route' },
    { status: 'completed', label: 'Completed' },
];
const supportRequestTerminalStatuses = new Set(['cancelled', 'completed', 'rejected']);
const supportRequestActionConfigs = {
    accepted: {
        endpoint: 'accept',
        label: 'Accept',
        icon: 'check',
        tone: 'primary',
        title: 'Accept Request',
        submitLabel: 'Accept',
        busyMessage: 'Accepting request...',
        rows: [[{
            type: 'textarea',
            name: 'notes',
            label: 'Review notes',
            placeholder: 'Optional notes for the support log',
        }]],
    },
    rejected: {
        endpoint: 'reject',
        label: 'Reject',
        icon: 'x',
        tone: 'danger',
        title: 'Reject Request',
        submitLabel: 'Reject',
        busyMessage: 'Rejecting request...',
        rows: [[{
            type: 'textarea',
            name: 'reason',
            label: 'Reason',
            required: true,
            placeholder: 'Why Support cannot fulfill this request',
        }]],
    },
    assigned: {
        endpoint: 'assign',
        label: 'Assign',
        icon: 'user',
        tone: 'primary',
        title: 'Assign Resource',
        submitLabel: 'Assign',
        busyMessage: 'Assigning resource...',
        rows: [
            [
                {
                    type: 'input',
                    name: 'team_name',
                    label: 'Team or resource',
                    required: true,
                    placeholder: 'Rescue Team 1',
                },
                {
                    type: 'input',
                    name: 'eta',
                    label: 'ETA',
                    placeholder: '20 minutes',
                },
            ],
            [{
                type: 'textarea',
                name: 'notes',
                label: 'Dispatch notes',
                placeholder: 'Optional assignment notes',
            }],
        ],
    },
    en_route: {
        endpoint: 'en-route',
        label: 'En Route',
        icon: 'arrow',
        tone: 'primary',
        title: 'Mark En Route',
        submitLabel: 'Mark En Route',
        busyMessage: 'Updating request...',
        rows: [[{
            type: 'textarea',
            name: 'notes',
            label: 'Movement notes',
            placeholder: 'Optional departure or route notes',
        }]],
    },
    completed: {
        endpoint: 'complete',
        label: 'Complete',
        icon: 'check',
        tone: 'primary',
        title: 'Complete Request',
        submitLabel: 'Complete',
        busyMessage: 'Completing request...',
        rows: [[{
            type: 'textarea',
            name: 'outcome',
            label: 'Outcome',
            placeholder: 'What was delivered or resolved',
        }]],
    },
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
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
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

const getStoredLoginEmail = () => {
    try {
        return localStorage.getItem(LOGIN_EMAIL_STORAGE_KEY) || '';
    } catch {
        return '';
    }
};

const storeLoginEmail = (email) => {
    const value = String(email || '').trim();
    if (!value) return;
    try {
        localStorage.setItem(LOGIN_EMAIL_STORAGE_KEY, value);
    } catch {
        // localStorage can be unavailable in restricted browser contexts.
    }
};

const shouldUseAccountSso = () => {
    const accountSso = state.app?.accountSso || {};

    return Boolean(!accountSsoErrorOnLoad && accountSso.enabled && accountSso.ready && accountSso.loginUrl);
};

const redirectToAccountSso = () => {
    const accountSso = state.app?.accountSso || {};
    const loginUrl = new URL(accountSso.loginUrl || '/auth/account/redirect', window.location.origin);
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}` || '/';
    loginUrl.searchParams.set('return', returnTo);
    window.location.assign(loginUrl.toString());
};

const redirectToAccountLogout = () => {
    const accountSso = state.app?.accountSso || {};
    window.location.assign(accountSso.logoutUrl || '/auth/logout');
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

const normalizeMatchKey = (value) => String(value || '').trim().toLowerCase();

const sourceHubKeys = (source = {}) => [
    source?.id,
    source?.source_hub_id,
    source?.data?.source_hub_id,
    source?.data?.hub_id,
    source?.data?.snapshot?.hub_id,
]
    .map(normalizeMatchKey)
    .filter(Boolean);

const sourceRelayHubKeys = (source = {}) => [
    source?.relay_hub_id,
    source?.source_relay_hub_id,
    source?.data?.source_relay_hub_id,
    source?.data?.relay_hub_id,
    source?.data?.snapshot?.relay_hub_id,
]
    .map(normalizeMatchKey)
    .filter(Boolean);

const sourceNameKeys = (source = {}) => [
    source?.name,
    source?.source_hub_name,
    source?.data?.source_hub_name,
    source?.data?.name,
    source?.data?.snapshot?.name,
]
    .map(normalizeMatchKey)
    .filter(Boolean);

const sourceMatchesRequest = (source, request) => {
    const sourceIds = new Set(sourceHubKeys(source));
    const sourceRelayIds = new Set(sourceRelayHubKeys(source));
    const sourceNames = new Set(sourceNameKeys(source));
    const requestHubId = normalizeMatchKey(request?.source_hub_id);
    const requestRelayHubId = normalizeMatchKey(request?.source_relay_hub_id);
    const requestSourceName = normalizeMatchKey(request?.source_hub_name);

    if (requestHubId && sourceIds.has(requestHubId)) return true;
    if (requestRelayHubId && sourceRelayIds.has(requestRelayHubId)) return true;

    return !!(requestSourceName && sourceNames.has(requestSourceName));
};

const relatedSupportRequestsForSource = (source) => supportRequestsData.filter((request) => sourceMatchesRequest(source, request));

const sourceMatchesHubRecord = (source, record = {}) => {
    const sourceIds = new Set(sourceHubKeys(source));
    const sourceRelayIds = new Set(sourceRelayHubKeys(source));
    const sourceNames = new Set(sourceNameKeys(source));
    const recordHubId = normalizeMatchKey(record?.source_hub_id || record?.hub_id);
    const recordRelayHubId = normalizeMatchKey(record?.source_relay_hub_id || record?.relay_hub_id);
    const recordSourceName = normalizeMatchKey(record?.source_hub_name || record?.hub_name || record?.source_name);

    if (recordHubId && sourceIds.has(recordHubId)) return true;
    if (recordRelayHubId && sourceRelayIds.has(recordRelayHubId)) return true;

    return !!(recordSourceName && sourceNames.has(recordSourceName));
};

const relatedIncidentReportsForSource = (source) => (state.currentSitrep.mapPoints || [])
    .filter((incident) => sourceMatchesHubRecord(source, incident));

const relatedMediaForSource = (source) => (state.currentSitrep.mediaRefs || [])
    .filter((media) => sourceMatchesHubRecord(source, media));

const incidentMediaRefs = (source, incident) => {
    const incidentId = normalizeMatchKey(String(incident?.incident_id || incident?.id || '').replace(/^#/, ''));
    if (!incidentId) return [];

    return relatedMediaForSource(source).filter((media) => {
        const mediaIncidentId = normalizeMatchKey(media?.incident_id);

        return mediaIncidentId === incidentId;
    });
};

const refreshActiveSourceDetailHeader = () => {
    if (!activeSourceDetailId) return;

    const source = (state.currentSitrep.sources || []).find((item) => currentSitrepSourceId(item) === activeSourceDetailId);
    const metaHost = document.querySelector('[data-source-detail-live-meta]');
    if (!source || !metaHost) return;

    metaHost.innerHTML = sourceDetailMetaMarkup(source);
};

const applySourceHeartbeatSnapshot = (snapshot = {}, options = {}) => {
    if (!state.currentSitrep.available) return;

    const sourceHeartbeats = mergeHeartbeatCache(
        state.currentSitrep.sourceHeartbeats || [],
        Array.isArray(snapshot.sources) ? snapshot.sources : [],
        { replace: options.replace === true },
    );

    state.currentSitrep = {
        ...state.currentSitrep,
        sourceHeartbeats,
        sourceHeartbeatsLoading: false,
        sources: mergeSourceHeartbeats(state.currentSitrep.sources || [], sourceHeartbeats),
    };

    if (sourcesNavigationStack?.getState?.().currentPage?.id === 'sources-list') {
        refreshSourcesList();
    }

    refreshActiveSourceDetailHeader();
};

const disconnectSourceHeartbeatRealtime = () => {
    sourceHeartbeatRealtimeClient?.close?.();
    sourceHeartbeatRealtimeClient = null;
    sourceHeartbeatRealtimeConnecting = false;
};

const connectSourceHeartbeatRealtime = async () => {
    if (!state.account || sourceHeartbeatRealtimeClient || sourceHeartbeatRealtimeConnecting) return;

    sourceHeartbeatRealtimeConnecting = true;

    try {
        const data = await api('/api/realtime/source-heartbeats/admission', {
            method: 'POST',
            body: '{}',
            reauthOnUnauthorized: false,
        });
        const admission = data.admission || data;
        const room = String(admission?.room || '').trim();
        const eventType = String(admission?.event_type || sourceHeartbeatRealtimeEventType).trim() || sourceHeartbeatRealtimeEventType;

        if (!admission?.token || !admission?.websocket_url || !room) {
            throw new Error('Realtime heartbeat admission is incomplete.');
        }

        const client = new RealtimeSocketClient({
            websocketUrl: admission.websocket_url,
            token: admission.token,
            onOpen() {
                client.sendRequest('session.auth.request', null, {
                    token: admission.token,
                });
            },
            onError(event) {
                console.debug('Source heartbeat Realtime socket error.', event);
            },
            onClose() {
                if (sourceHeartbeatRealtimeClient === client) {
                    sourceHeartbeatRealtimeClient = null;
                }
            },
        });

        client.on('envelope', (envelope) => {
            if (envelope?.phase === 'ack' && envelope?.type === 'session.auth.request') {
                client.sendRequest('room.join.request', room, {});
                return;
            }

            if (envelope?.phase === 'event' && envelope?.type === eventType) {
                applySourceHeartbeatSnapshot(envelope.payload || {});
            }
        });

        sourceHeartbeatRealtimeClient = client;
        sourceHeartbeatRealtimeEventType = eventType;
        client.connect();
    } catch (error) {
        console.debug('Source heartbeat Realtime unavailable.', error);
        disconnectSourceHeartbeatRealtime();
    } finally {
        sourceHeartbeatRealtimeConnecting = false;
    }
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

const sourceHeartbeatLoadingStrip = () => {
    const host = document.createElement('div');
    host.className = 'support-source-heartbeat-strip support-source-heartbeat-strip-loading';
    mountSkeleton(host, {
        lines: 2,
    }, {
        className: 'support-source-heartbeat-strip-skeleton',
    });

    return host;
};

const sourceCard = (source) => {
    const card = document.createElement('article');
    card.className = ['support-source-card', alertToneClass(source?.alert_level)].filter(Boolean).join(' ');
    const sourceId = currentSitrepSourceId(source);
    const sourceVisible = !sourceDataVisibleIds.has(sourceId);
    const isSourceBoundaryVisible = () => !sourceDataVisibleIds.has(sourceId);
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Open source details for ${source?.name || 'source hub'}`);

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
    } else if (state.currentSitrep.sourceHeartbeatsLoading) {
        heading.appendChild(sourceHeartbeatLoadingStrip());
    } else {
        heading.appendChild(sourceHeartbeatStrip(null));
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
        openSourceDetail(source);
    });

    card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }
        event.preventDefault();
        if (isSourceBoundaryVisible()) {
            dashboardMap?.fitSourceBoundary?.(sourceId, { duration: 650 });
        }
        openSourceDetail(source);
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

const destroySourcesStack = () => {
    sourceVirtualList?.destroy?.();
    sourceVirtualList = null;
    sourceAlertSelect?.destroy?.();
    sourceAlertSelect = null;
    sourceDetailVirtualLists.forEach((list) => list?.destroy?.());
    sourceDetailVirtualLists.clear();
    sourcesNavigationStack?.destroy?.();
    sourcesNavigationStack = null;
    activeSourceDetailId = null;
};

const sourceStackBackButton = (label) => `
    <button type="button" class="support-source-stack-back" data-source-stack-back>
        ${icons.arrow || ''}
        <span>${escapeHtml(label)}</span>
    </button>
`;

const sourceStackCloseButton = (label) => `
    <button type="button" class="support-source-stack-close" data-source-stack-close aria-label="${escapeHtml(label)}">
        ${icons.close || ''}
    </button>
`;

const sourceHeartbeatStatusLabel = (source) => {
    if (state.currentSitrep.sourceHeartbeatsLoading && !source?.heartbeat) return 'Heartbeat loading';
    if (!source?.heartbeat) return 'Heartbeat unavailable';

    return [
        source.heartbeat.status ? titleCase(source.heartbeat.status) : 'Heartbeat unknown',
        source.heartbeat.last_seen_at ? `seen ${supportRequestOptionalTime(source.heartbeat.last_seen_at)}` : '',
    ].filter(Boolean).join(' - ');
};

const sourceDetailMetaMarkup = (source) => {
    const hubIds = [
        source?.id ? `Hub ${source.id}` : '',
        source?.relay_hub_id ? `Relay ${source.relay_hub_id}` : '',
    ].filter(Boolean).join(' - ');

    return `
        <div class="support-source-detail-meta">
            ${source?.alert_level ? `<span class="support-source-alert ${alertToneClass(source.alert_level)}">${escapeHtml(titleCase(source.alert_level))}</span>` : ''}
            <span>${escapeHtml(source?.snapshot_at ? `${supportRequestOptionalTime(source.snapshot_at)} snapshot` : 'Snapshot age unavailable')}</span>
            <span>${escapeHtml(sourceHeartbeatStatusLabel(source))}</span>
            ${hubIds ? `<span>${escapeHtml(hubIds)}</span>` : ''}
        </div>
    `;
};

const sourceDetailListKey = (source, name) => `${currentSitrepSourceId(source) || 'source'}:${name}`;

const destroySourceDetailLists = (source) => {
    const sourceId = currentSitrepSourceId(source);

    Array.from(sourceDetailVirtualLists.keys())
        .filter((key) => key.startsWith(`${sourceId}:`))
        .forEach((key) => {
            sourceDetailVirtualLists.get(key)?.destroy?.();
            sourceDetailVirtualLists.delete(key);
        });
};

const incidentReportNumber = (incident) => {
    const raw = String(incident?.display_id || incident?.incident_ref || incident?.incident_id || incident?.id || '').trim().replace(/^#/, '');
    if (!raw) return '#----';

    return `#${/^\d+$/.test(raw) ? raw.padStart(4, '0') : raw}`;
};

const incidentReportTypes = (incident) => {
    const values = [
        incident?.incident_types,
        incident?.incident_type,
        incident?.type,
        incident?.classification,
        incident?.status,
    ].flatMap((value) => Array.isArray(value) ? value : [value])
        .map((value) => String(value || '').trim())
        .filter(Boolean);

    return values.join(', ') || 'SITREP point';
};

const mediaTitle = (media) => {
    const filename = String(media?.original_filename || '').trim();
    if (filename) return filename;

    const kind = String(media?.kind || 'media').replace(/_/g, ' ');
    const id = media?.media_id || media?.attachment_id || media?.id || '';

    return `${titleCase(kind)}${id ? ` #${id}` : ''}`;
};

const mediaSubtitle = (media) => {
    const parts = [
        media?.mime_type,
        media?.incident_id ? `Incident #${media.incident_id}` : '',
    ].filter(Boolean);

    return parts.join(' - ') || 'SITREP media evidence';
};

const mediaKindLabel = (media) => titleCase(String(media?.kind || 'media').replace(/_/g, ' '));

const sourceStackIncidentReportCard = (source, incident) => {
    const card = document.createElement('article');
    const mediaCount = incidentMediaRefs(source, incident).length;
    card.className = 'support-source-stack-list-card support-source-stack-incident-card';
    card.innerHTML = `
        <strong>${escapeHtml(incidentReportNumber(incident))} <span aria-hidden="true">|</span> ${escapeHtml(incidentReportTypes(incident))}</strong>
        <span>${escapeHtml(mediaCount ? `${mediaCount} media item${mediaCount === 1 ? '' : 's'}` : 'No linked media')}</span>
    `;

    return card;
};

const sourceStackMediaCard = (media, options = {}) => {
    const card = document.createElement('article');
    card.className = 'support-source-stack-list-card support-source-stack-media-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.dataset.mediaPath = media?.local_url || '';

    if (options.onClick) {
        card.addEventListener('click', options.onClick);
        card.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            options.onClick(event);
        });
    }

    card.innerHTML = `
        <strong>${escapeHtml(mediaTitle(media))}</strong>
        <span>${escapeHtml(mediaSubtitle(media))}</span>
        <small>${escapeHtml(mediaKindLabel(media))}</small>
    `;

    return card;
};

const renderRelatedSourceRequests = async (source, listHost) => {
    if (!listHost) return;
    const listKey = sourceDetailListKey(source, 'requests');

    sourceDetailVirtualLists.get(listKey)?.destroy?.();
    sourceDetailVirtualLists.delete(listKey);
    listHost.innerHTML = supportRequestListLoadingMarkup();
    mountLoadingSkeletons(listHost);

    try {
        await loadSupportRequests();
        const requests = relatedSupportRequestsForSource(source);
        listHost.innerHTML = '';
        listHost.onclick = (event) => {
            const card = event.target?.closest?.('[data-support-request-id]');
            if (!card || !listHost.contains(card)) return;
            openSourceStackRequestDetail(source, card.dataset.supportRequestId);
        };
        listHost.onkeydown = (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const card = event.target?.closest?.('[data-support-request-id]');
            if (!card || !listHost.contains(card)) return;
            event.preventDefault();
            openSourceStackRequestDetail(source, card.dataset.supportRequestId);
        };
        const virtualList = helpers.createVirtualList(listHost, requests, {
            ariaLabel: `Support requests related to ${source?.name || 'source hub'}`,
            chrome: false,
            emptyText: 'No explicit support requests are linked to this source yet.',
            height: Math.max(220, listHost.clientHeight || 360),
            rowHeight: 138,
            overscan: 4,
            renderItem: (request) => supportRequestCard(request, {
                onClick: () => openSourceStackRequestDetail(source, request?.id),
            }),
        });
        sourceDetailVirtualLists.set(listKey, virtualList);
    } catch (error) {
        listHost.innerHTML = supportRequestEmptyState('Unable to load related requests', firstError(error, 'Unable to load support requests.'));
    }
};

const renderRelatedSourceIncidents = (source, listHost) => {
    if (!listHost) return;
    const listKey = sourceDetailListKey(source, 'incidents');

    sourceDetailVirtualLists.get(listKey)?.destroy?.();
    sourceDetailVirtualLists.delete(listKey);
    listHost.innerHTML = '';

    const incidents = relatedIncidentReportsForSource(source);
    const virtualList = helpers.createVirtualList(listHost, incidents, {
        ariaLabel: `Incident reports related to ${source?.name || 'source hub'}`,
        chrome: false,
        emptyText: 'No incident reports are linked to this source yet.',
        height: Math.max(220, listHost.clientHeight || 360),
        rowHeight: 76,
        overscan: 5,
        renderItem: (incident) => sourceStackIncidentReportCard(source, incident),
    });
    sourceDetailVirtualLists.set(listKey, virtualList);
};

const renderRelatedSourceMedia = (source, listHost) => {
    if (!listHost) return;
    const listKey = sourceDetailListKey(source, 'media');

    sourceDetailVirtualLists.get(listKey)?.destroy?.();
    sourceDetailVirtualLists.delete(listKey);
    listHost.innerHTML = '';

    const mediaRefs = relatedMediaForSource(source);
    const virtualList = helpers.createVirtualList(listHost, mediaRefs, {
        ariaLabel: `SITREP media related to ${source?.name || 'source hub'}`,
        chrome: false,
        emptyText: 'No media refs are linked to this source yet.',
        height: Math.max(220, listHost.clientHeight || 360),
        rowHeight: 86,
        overscan: 5,
        renderItem: (media) => sourceStackMediaCard(media, {
            onClick: () => openSourceStackMediaDetail(source, media),
        }),
    });
    sourceDetailVirtualLists.set(listKey, virtualList);
};

const refreshActiveSourceDetailRequests = () => {
    if (!activeSourceDetailId) return;
    const source = (state.currentSitrep.sources || []).find((item) => currentSitrepSourceId(item) === activeSourceDetailId);
    if (!source) return;

    const requestList = document.querySelector('[data-source-detail-request-list]');
    const incidentList = document.querySelector('[data-source-detail-incident-list]');
    const mediaList = document.querySelector('[data-source-detail-media-list]');

    if (requestList) {
        renderRelatedSourceRequests(source, requestList);
    }
    if (incidentList) {
        renderRelatedSourceIncidents(source, incidentList);
    }
    if (mediaList) {
        renderRelatedSourceMedia(source, mediaList);
    }
};

const sourceDetailPage = (source) => {
    const sourceId = currentSitrepSourceId(source);

    return {
        id: `source-${sourceId || 'detail'}`,
        title: source?.name || 'Source detail',
        className: 'support-source-stack-page is-source-detail',
        mount(body, { api: stackApi }) {
            body.innerHTML = `
                <div class="support-source-detail-page">
                    <header class="support-source-detail-header has-close-action">
                        <div>
                            <p class="ui-eyebrow">Source Detail</p>
                            <h3>${escapeHtml(source?.name || 'Source hub')}</h3>
                            <p>${escapeHtml(source?.subtitle || source?.domain || source?.code || 'No deployment label')}</p>
                            <div data-source-detail-live-meta>${sourceDetailMetaMarkup(source)}</div>
                        </div>
                        ${sourceStackCloseButton('Close source details')}
                    </header>
                    <div class="support-source-detail-content">
                        <div class="support-source-detail-tabs" role="tablist" aria-label="Source detail views">
                            <button type="button" class="support-source-detail-tab is-active" role="tab" aria-selected="true" data-source-detail-tab="requests">Support Requests</button>
                            <button type="button" class="support-source-detail-tab" role="tab" aria-selected="false" data-source-detail-tab="incidents">Incident Reports</button>
                            <button type="button" class="support-source-detail-tab" role="tab" aria-selected="false" data-source-detail-tab="media">Media</button>
                        </div>
                        <div class="support-source-detail-tabpanels">
                            <section class="support-source-detail-tabpanel is-active" role="tabpanel" data-source-detail-panel="requests">
                                <div class="support-source-detail-request-list" data-source-detail-request-list="${escapeHtml(sourceId)}"></div>
                            </section>
                            <section class="support-source-detail-tabpanel" role="tabpanel" data-source-detail-panel="incidents" hidden>
                                <div class="support-source-detail-request-list" data-source-detail-incident-list="${escapeHtml(sourceId)}"></div>
                            </section>
                            <section class="support-source-detail-tabpanel" role="tabpanel" data-source-detail-panel="media" hidden>
                                <div class="support-source-detail-request-list" data-source-detail-media-list="${escapeHtml(sourceId)}"></div>
                            </section>
                        </div>
                    </div>
                </div>
            `;
            body.querySelector('[data-source-stack-close]')?.addEventListener('click', () => stackApi.pop({ transition: 'none' }));
            const setActiveTab = (tabName) => {
                body.querySelectorAll('[data-source-detail-tab]').forEach((tab) => {
                    const active = tab.dataset.sourceDetailTab === tabName;
                    tab.classList.toggle('is-active', active);
                    tab.setAttribute('aria-selected', active ? 'true' : 'false');
                });
                body.querySelectorAll('[data-source-detail-panel]').forEach((panel) => {
                    const active = panel.dataset.sourceDetailPanel === tabName;
                    panel.classList.toggle('is-active', active);
                    panel.hidden = !active;
                });
            };

            body.querySelectorAll('[data-source-detail-tab]').forEach((tab) => {
                tab.addEventListener('click', () => {
                    const tabName = tab.dataset.sourceDetailTab || 'requests';
                    setActiveTab(tabName);
                    if (tabName === 'requests') {
                        renderRelatedSourceRequests(source, body.querySelector('[data-source-detail-request-list]'));
                    } else if (tabName === 'incidents') {
                        renderRelatedSourceIncidents(source, body.querySelector('[data-source-detail-incident-list]'));
                    } else if (tabName === 'media') {
                        renderRelatedSourceMedia(source, body.querySelector('[data-source-detail-media-list]'));
                    }
                });
            });

            renderRelatedSourceRequests(source, body.querySelector('[data-source-detail-request-list]'));
            renderRelatedSourceIncidents(source, body.querySelector('[data-source-detail-incident-list]'));
            renderRelatedSourceMedia(source, body.querySelector('[data-source-detail-media-list]'));
        },
        onShow() {
            activeSourceDetailId = sourceId;
            if (sourceId) {
                dashboardMap?.fitSourceBoundary?.(sourceId, { duration: 650 });
                dashboardMap?.highlightSourceBoundary?.(sourceId);
            }
        },
        onHide() {
            dashboardMap?.clearSourceBoundaryHighlight?.();
        },
        onDestroy() {
            destroySourceDetailLists(source);
            if (activeSourceDetailId === sourceId) {
                activeSourceDetailId = null;
            }
        },
    };
};

const renderSourceStackRequestDetail = (detailHost, request, source) => {
    renderSupportRequestDetailContent(detailHost, request, {
        emptyTitle: 'Select a request',
        emptyMessage: 'Request details will appear here.',
        onUpdated(updatedRequest) {
            renderSourceStackRequestDetail(detailHost, updatedRequest, source);
            refreshActiveSourceDetailRequests();
        },
    });
};

const openSourceStackRequestDetail = (source, requestId) => {
    if (!sourcesNavigationStack) return;
    const id = String(requestId || '');
    if (!id) return;
    const cachedRequest = supportRequestsData.find((item) => String(item?.id) === id);
    const sourceId = currentSitrepSourceId(source);
    const pageId = `source-${sourceId || 'detail'}-request-${id}`;

    if (sourcesNavigationStack.getState?.().currentPage?.id === pageId) {
        return;
    }

    sourcesNavigationStack.push({
        id: pageId,
        title: cachedRequest?.requested_assistance || 'Support request detail',
        className: 'support-source-stack-page is-request-detail',
        mount(body, { api: stackApi }) {
            const backToSource = () => {
                const sourcePageId = `source-${sourceId || 'detail'}`;
                if (!stackApi.goTo(sourcePageId, { transition: 'none' })) {
                    stackApi.replace(sourceDetailPage(source), { transition: 'none' });
                }
            };

            body.innerHTML = `
                <div class="support-source-request-page">
                    <header class="support-source-detail-header">
                        ${sourceStackBackButton(source?.name || 'Source Detail')}
                        <div>
                            <p class="ui-eyebrow">Support Request</p>
                            <h3>${escapeHtml(cachedRequest?.requested_assistance || 'Support request')}</h3>
                            <p>${escapeHtml(source?.name || supportRequestSourceLabel(cachedRequest) || 'Source hub')}</p>
                        </div>
                    </header>
                    <section class="support-source-request-detail" data-source-stack-request-detail>
                        ${supportRequestDetailLoadingMarkup()}
                    </section>
                </div>
            `;
            body.querySelector('[data-source-stack-back]')?.addEventListener('click', backToSource);
            const detailHost = body.querySelector('[data-source-stack-request-detail]');
            mountLoadingSkeletons(detailHost);

            (async () => {
                try {
                    const shouldAcknowledgeReview = String(cachedRequest?.status || '').toLowerCase() === 'requested';
                    const data = shouldAcknowledgeReview
                        ? await api(`/api/support-requests/${encodeURIComponent(id)}/receive`, {
                            method: 'POST',
                            body: '{}',
                        })
                        : await api(`/api/support-requests/${encodeURIComponent(id)}`);

                    if (data.request) {
                        upsertCachedSupportRequest(data.request);
                        renderSourceStackRequestDetail(detailHost, data.request, source);
                    }
                } catch (error) {
                    detailHost.innerHTML = supportRequestEmptyState('Unable to load request details', firstError(error, 'Unable to load request details.'));
                }
            })();
        },
    }, { transition: 'none' });
};

const mediaPreviewMarkup = (media) => {
    const url = media?.local_url || '';
    const mime = String(media?.mime_type || '').toLowerCase();

    if (!url) {
        return '<div class="support-source-media-preview-empty">Media URL unavailable</div>';
    }

    if (mime.startsWith('image/')) {
        return `<img src="${escapeHtml(url)}" alt="${escapeHtml(mediaTitle(media))}" loading="lazy">`;
    }

    if (mime.startsWith('video/')) {
        return `<video src="${escapeHtml(url)}" controls preload="metadata"></video>`;
    }

    if (mime.startsWith('audio/')) {
        return `<audio src="${escapeHtml(url)}" controls preload="metadata"></audio>`;
    }

    return `
        <div class="support-source-media-preview-empty">
            <p>${escapeHtml(mediaKindLabel(media))}</p>
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener">Open media</a>
        </div>
    `;
};

const openSourceStackMediaDetail = (source, media) => {
    if (!sourcesNavigationStack || !media?.local_url) return;

    const sourceId = currentSitrepSourceId(source);
    const pageId = `source-${sourceId || 'detail'}-media-${btoa(media.local_url).replace(/=+$/g, '')}`;

    if (sourcesNavigationStack.getState?.().currentPage?.id === pageId) {
        return;
    }

    sourcesNavigationStack.push({
        id: pageId,
        title: mediaTitle(media),
        className: 'support-source-stack-page is-media-detail',
        mount(body, { api: stackApi }) {
            const backToSource = () => {
                const sourcePageId = `source-${sourceId || 'detail'}`;
                if (!stackApi.goTo(sourcePageId, { transition: 'none' })) {
                    stackApi.replace(sourceDetailPage(source), { transition: 'none' });
                }
            };

            body.innerHTML = `
                <div class="support-source-media-page">
                    <header class="support-source-detail-header">
                        ${sourceStackBackButton(source?.name || 'Source Detail')}
                        <div>
                            <p class="ui-eyebrow">SITREP Media</p>
                            <h3>${escapeHtml(mediaTitle(media))}</h3>
                            <p>${escapeHtml(source?.name || 'Source hub')}</p>
                        </div>
                    </header>
                    <section class="support-source-media-detail">
                        <div class="support-source-media-preview">
                            ${mediaPreviewMarkup(media)}
                        </div>
                        <div class="support-source-detail-context">
                            ${supportRequestDetailRow('Kind', mediaKindLabel(media))}
                            ${supportRequestDetailRow('Incident', media?.incident_id ? `#${media.incident_id}` : null)}
                            ${supportRequestDetailRow('Source hub', media?.source_hub_id)}
                            ${supportRequestDetailRow('MIME type', media?.mime_type)}
                            ${supportRequestDetailRow('Local URL', media?.local_url)}
                        </div>
                    </section>
                </div>
            `;
            body.querySelector('[data-source-stack-back]')?.addEventListener('click', backToSource);
        },
    }, { transition: 'none' });
};

const openSourceDetail = (source) => {
    if (!sourcesNavigationStack) return;

    const sourceId = currentSitrepSourceId(source);
    if (sourceId) {
        dashboardMap?.fitSourceBoundary?.(sourceId, { duration: 650 });
        dashboardMap?.highlightSourceBoundary?.(sourceId);
    }

    sourcesNavigationStack.push(sourceDetailPage(source), { transition: 'none' });
};

const sourcesListPage = () => ({
    id: 'sources-list',
    title: 'Sources',
    className: 'support-source-stack-page is-sources-list',
    mount(body) {
        body.innerHTML = sourcesPanelMarkup();
        bindSourcesToolbar(body);
        mountSourcesList(body.querySelector('[data-sitrep-sources-list]'), filteredSources());
    },
});

const mountSourcesNavigationStack = (host) => {
    const stackHost = host.querySelector('[data-sources-stack-host]');
    if (!stackHost) return;

    try {
        sourcesNavigationStack = helpers.createNavigationStack(stackHost, {
            ariaLabel: 'Sources drill-down navigation',
            chrome: false,
            className: 'support-sources-navigation-stack',
            transition: 'none',
            initialPages: [sourcesListPage()],
            onChange({ currentPage }) {
                if (currentPage?.id === 'sources-list') {
                    refreshSourcesList();
                }
            },
        });

        if (!stackHost.querySelector('[data-sitrep-sources-list]')) {
            throw new Error('Sources navigation stack did not mount the initial list page.');
        }
    } catch (error) {
        console.error('Unable to mount sources navigation stack.', error);
        sourcesNavigationStack?.destroy?.();
        sourcesNavigationStack = null;
        sourceVirtualList?.destroy?.();
        sourceVirtualList = null;
        sourceAlertSelect?.destroy?.();
        sourceAlertSelect = null;
        host.innerHTML = sourcesPanelMarkup();
        bindSourcesToolbar(host);
        try {
            mountSourcesList(host.querySelector('[data-sitrep-sources-list]'), filteredSources());
        } catch (fallbackError) {
            console.error('Unable to mount sources fallback list.', fallbackError);
            const listHost = host.querySelector('[data-sitrep-sources-list]');
            if (listHost) {
                listHost.innerHTML = `
                    <div class="support-sources-rail-placeholder">
                        <p class="ui-eyebrow">Sources</p>
                        <p>Unable to render source hubs.</p>
                    </div>
                `;
            }
        }
    }
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

    if (state.currentSitrep.loading) {
        destroySourcesStack();
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
        destroySourcesStack();
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

    if (!sourcesNavigationStack) {
        host.innerHTML = '<div class="support-sources-stack-host" data-sources-stack-host></div>';
        mountSourcesNavigationStack(host);
        return;
    }

    if (sourcesNavigationStack.getState?.().currentPage?.id === 'sources-list') {
        refreshSourcesList();
    }
    refreshActiveSourceDetailRequests();
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

    const loadId = ++currentSitrepLoadId;
    state.currentSitrep.loading = true;
    state.currentSitrep.sourceHeartbeatsLoading = true;
    renderCurrentSitrepPane();
    renderSourcesRail();

    const heartbeatRequest = api('/api/source-heartbeats?hours=48', {
        reauthOnUnauthorized: false,
    }).catch(() => ({ available: false, sources: [] }));

    try {
        const data = await api('/api/sitreps/current', {
            reauthOnUnauthorized: false,
        });
        if (loadId !== currentSitrepLoadId) return;

        state.currentSitrep = {
            loading: false,
            available: Boolean(data.available),
            html: data.html || null,
            css: data.css || null,
            sitrep: data.sitrep || null,
            identity: data.identity || null,
            contextBoundary: data.context_boundary || null,
            sections: Array.isArray(data.sections) ? data.sections : [],
            sources: Array.isArray(data.sources) ? data.sources : [],
            sourceHeartbeats: [],
            sourceHeartbeatsLoading: true,
            activeSection: state.currentSitrep.activeSection || 'summary',
            mapPoints: Array.isArray(data.map_points) ? data.map_points : [],
            mediaRefs: Array.isArray(data.media_refs) ? data.media_refs : [],
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
        renderCurrentSitrepPane();
        renderSourcesRail();

        const heartbeatData = await heartbeatRequest;
        if (loadId !== currentSitrepLoadId) return;

        const sourceHeartbeats = Array.isArray(heartbeatData.sources) ? heartbeatData.sources : [];
        applySourceHeartbeatSnapshot({ sources: sourceHeartbeats }, { replace: true });
        renderSourcesRail();
    } catch (error) {
        if (loadId !== currentSitrepLoadId) return;

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
            sourceHeartbeatsLoading: false,
            activeSection: state.currentSitrep.activeSection || 'summary',
            mapPoints: [],
            mediaRefs: [],
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

        heartbeatRequest.catch(() => {});

        renderCurrentSitrepPane();
        renderSourcesRail();
    }
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
    connectSourceHeartbeatRealtime();
    loadCurrentSitrep();
};

const render = () => {
    destroyNavbarClock();
    navbar?.destroy?.();
    navbar = null;
    dashboardSplitter?.destroy?.();
    dashboardSplitter = null;
    destroyDashboardMap();
    if (!state.account) {
        disconnectSourceHeartbeatRealtime();
        root.innerHTML = '<div class="login-gate" data-theme="dark" aria-hidden="true"></div>';
        window.requestAnimationFrame(() => openLogin({ required: true }));
        return;
    }

    root.innerHTML = `
        <div class="app-shell" data-theme="dark">
            <div data-navbar-host></div>
            <main class="app-main">
                ${dashboard()}
            </main>
        </div>
    `;
    renderNavbar();
    renderDashboardSplitter();
};

const openLogin = ({ required = !state.account } = {}) => {
    if (shouldUseAccountSso()) {
        redirectToAccountSso();
        return null;
    }

    if (loginModal?.getState?.().open) {
        return loginModal;
    }

    const loginOptions = {
        title: 'Login',
        message: accountSsoErrorOnLoad
            ? 'Unable to complete PBB Account sign in. You may try again or use local Support login.'
            : `Welcome to ${state.app.name}`,
        className: required ? 'support-login-modal is-required-login' : 'support-login-modal',
        submitLabel: 'Login',
        busyMessage: 'Signing in...',
        showCloseButton: !required,
        showCancelButton: !required,
        closeOnBackdrop: !required,
        closeOnEscape: !required,
        mediaUrl: APP_ICON_URL,
        mediaAlt: state.app.name,
        identifierKind: 'email',
        identifierLabel: 'Email address',
        identifierPlaceholder: 'name@agency.gov.ph',
        identifierAutocomplete: 'username',
        passwordLabel: 'Password',
        passwordPlaceholder: 'Enter your password',
        initialValues: { email: getStoredLoginEmail() },
        fields: {
            identifier: 'email',
            password: 'password',
        },
        onClose: () => {
            loginModal = null;
        },
        async onSubmit(values, ctx) {
            try {
                const data = await loginWithCredentials(values);
                storeLoginEmail(values?.email || values?.identifier);
                applySessionPayload(data);
                state.reauthOpen = false;
                render();
                return true;
            } catch (error) {
                ctx?.setFormError?.(firstError(error, 'Invalid email or password.'));
                return false;
            }
        },
    };

    if (LOGIN_BACKGROUND_IMAGE_URL) {
        loginOptions.backgroundImageUrl = LOGIN_BACKGROUND_IMAGE_URL;
        loginOptions.backgroundImageAlt = '';
        loginOptions.backgroundTone = 'dark';
    }

    loginModal = helpers.createLoginFormModal(loginOptions);
    loginModal.open();
    return loginModal;
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

const supportRequestUrgencyLabel = (urgency) => titleCase(urgency || 'normal');

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

const supportRequestJustificationValues = (request) => {
    const labels = Array.isArray(request?.justification_labels) ? request.justification_labels : [];
    const codes = Array.isArray(request?.justification_codes) ? request.justification_codes : [];
    const values = labels.length ? labels : codes;

    return values
        .map((value) => String(value || '').trim())
        .filter(Boolean);
};

const supportRequestJustificationChips = (request, limit = 4) => {
    const values = supportRequestJustificationValues(request);
    if (!values.length) return '';

    const visible = values.slice(0, limit);
    const overflow = values.length - visible.length;

    return `
        <div class="support-request-rationale-chips" aria-label="Support rationale">
            ${visible.map((value) => `<span>${escapeHtml(value)}</span>`).join('')}
            ${overflow > 0 ? `<span>+${overflow}</span>` : ''}
        </div>
    `;
};

const supportRequestNextStepLabel = (status) => {
    const normalized = String(status || 'requested').toLowerCase();
    if (normalized === 'cancelled') return 'Cancelled by Hotline';
    if (normalized === 'rejected') return 'Closed as rejected';
    if (normalized === 'completed') return 'Completed';
    if (normalized === 'requested') return 'Open to acknowledge review';
    if (normalized === 'received') return 'Accept or reject';
    if (normalized === 'accepted') return 'Assign resource';
    if (normalized === 'assigned') return 'Mark en route';
    if (normalized === 'en_route') return 'Complete request';

    return 'Review status';
};

const supportRequestAvailableActions = (request) => {
    const status = String(request?.status || '').toLowerCase();
    if (supportRequestTerminalStatuses.has(status)) return [];

    if (status === 'received') return ['accepted', 'rejected'];
    if (status === 'accepted') return ['assigned'];
    if (status === 'assigned') return ['en_route'];
    if (status === 'en_route') return ['completed'];

    return [];
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

const isCurrentSupportRequestSelection = (requestId) => String(selectedSupportRequestId || '') === String(requestId || '');

const syncSelectedSupportRequestCard = () => {
    supportRequestsModal?.body
        ?.querySelectorAll?.('[data-support-request-id]')
        ?.forEach((card) => {
            card.classList.toggle('is-selected', isCurrentSupportRequestSelection(card.dataset.supportRequestId));
        });
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
    if (normalized === 'completed' || normalized === 'fulfilled' || normalized === 'closed') return 'is-complete';
    return '';
};

const supportRequestCard = (request, options = {}) => {
    const card = document.createElement('article');
    const selected = options.selected ?? (String(request?.id) === String(selectedSupportRequestId));
    const onClick = typeof options.onClick === 'function'
        ? options.onClick
        : () => openSupportRequestDetail(request?.id);
    card.className = `support-request-card ${supportRequestStatusClass(request?.status)}${selected ? ' is-selected' : ''}`.trim();
    card.dataset.supportRequestId = String(request?.id || '');
    card.tabIndex = 0;

    const quantity = supportRequestQuantityLabel(request);
    const source = supportRequestSourceLabel(request);
    const capability = request?.requested_capability ? titleCase(request.requested_capability) : '';
    const assistance = request?.requested_assistance || capability || 'Support request';
    const requestedAt = supportRequestOptionalTime(request?.requested_at);
    const urgency = request?.urgency ? supportRequestUrgencyLabel(request.urgency) : '';
    card.innerHTML = `
        <div class="support-request-card-main">
            <div class="support-request-card-topline">
                <span class="support-request-status ${supportRequestStatusClass(request?.status)}">${escapeHtml(supportRequestStatusLabel(request?.status))}</span>
                ${urgency ? `<span class="support-request-urgency">${escapeHtml(urgency)}</span>` : ''}
                <span class="support-request-card-next">${escapeHtml(supportRequestNextStepLabel(request?.status))}</span>
            </div>
            <strong>${escapeHtml(source)}</strong>
            <span class="support-request-card-assistance">${escapeHtml(assistance)}</span>
            <div class="support-request-meta">
                ${capability ? `<span>${escapeHtml(capability)}</span>` : ''}
                ${quantity ? `<span>${escapeHtml(quantity)}</span>` : ''}
                ${requestedAt ? `<span>${escapeHtml(requestedAt)}</span>` : ''}
            </div>
            ${supportRequestJustificationChips(request, 2)}
        </div>
    `;
    card.onclick = (event) => {
        event.stopPropagation();
        onClick(request);
    };
    card.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onClick(request);
        }
    };

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
        rowHeight: 138,
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

const supportRequestDeliveryMarkup = (request) => {
    const deliveries = Array.isArray(request?.update_deliveries)
        ? request.update_deliveries
        : (request?.latest_update_delivery ? [request.latest_update_delivery] : []);

    if (!deliveries.length) {
        return supportRequestEmptyState('No outbound updates yet', 'Lifecycle delivery state will appear after Support sends an update.');
    }

    return `
        <div class="support-request-delivery-list">
            ${deliveries.slice(0, 4).map((delivery) => `
                <div class="support-request-delivery-item">
                    <span class="support-request-delivery-state is-${escapeHtml(String(delivery.delivery_status || 'pending').toLowerCase())}">
                        ${escapeHtml(titleCase(delivery.delivery_status || 'pending'))}
                    </span>
                    <strong>${escapeHtml(supportRequestMessageLabel(delivery.message_type || delivery.status || 'Support update'))}</strong>
                    <span>${escapeHtml([
                        delivery.submitted_at ? `Sent ${supportRequestOptionalTime(delivery.submitted_at)}` : '',
                        Number.isFinite(Number(delivery.attempt_count)) ? `${Number(delivery.attempt_count)} attempt${Number(delivery.attempt_count) === 1 ? '' : 's'}` : '',
                    ].filter(Boolean).join(' - ') || 'Waiting for Relay')}</span>
                    ${delivery.last_error ? `<p>${escapeHtml(delivery.last_error)}</p>` : ''}
                </div>
            `).join('')}
        </div>
    `;
};

const supportRequestFlowMarkup = (request) => {
    const status = String(request?.status || 'requested').toLowerCase();
    const currentIndex = supportRequestFlow.findIndex((step) => step.status === status);
    const terminal = status === 'cancelled' || status === 'rejected';

    return `
        <div class="support-request-flow" aria-label="Support request status flow">
            ${supportRequestFlow.map((step, index) => {
                const isCurrent = step.status === status;
                const isComplete = status === 'completed' || (currentIndex >= 0 && index < currentIndex);
                const stateClass = isCurrent ? 'is-current' : (isComplete ? 'is-done' : '');

                return `<span class="${stateClass}">${escapeHtml(step.label)}</span>`;
            }).join('')}
            ${terminal ? `<span class="is-terminal">${escapeHtml(supportRequestStatusLabel(status))}</span>` : ''}
        </div>
    `;
};

const supportRequestActionButtonsMarkup = (request) => {
    const actions = supportRequestAvailableActions(request);
    if (!actions.length) {
        return `
            <div class="support-request-action-note">
                ${escapeHtml(supportRequestTerminalStatuses.has(String(request?.status || '').toLowerCase())
                    ? `${supportRequestStatusLabel(request?.status)} is terminal.`
                    : supportRequestNextStepLabel(request?.status))}
            </div>
        `;
    }

    return `
        <div class="support-request-actions" aria-label="Support request actions">
            ${actions.map((action) => {
                const config = supportRequestActionConfigs[action];
                return `
                    <button type="button" class="support-request-action-button is-${escapeHtml(config.tone || 'secondary')}" data-support-request-action="${escapeHtml(action)}" ${supportRequestActionBusy ? 'disabled' : ''}>
                        ${icons[config.icon] || ''}
                        <span>${escapeHtml(config.label)}</span>
                    </button>
                `;
            }).join('')}
        </div>
    `;
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

    const actions = Array.isArray(request?.actions) ? request.actions : [];
    actions.forEach((action) => {
        const metadata = action.metadata && typeof action.metadata === 'object'
            ? Object.entries(action.metadata)
                .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
                .map(([key, value]) => `${titleCase(key)}: ${value}`)
                .join(' - ')
            : '';

        events.push({
            label: supportRequestStatusLabel(action.to_status || action.action),
            at: action.acted_at,
            detail: [
                action.actor_name || (action.actor_user_id ? `User #${action.actor_user_id}` : 'Support operator'),
                action.from_status && action.to_status ? `${supportRequestStatusLabel(action.from_status)} -> ${supportRequestStatusLabel(action.to_status)}` : '',
                metadata,
            ].filter(Boolean).join(' - '),
            errors: action.notes ? null : undefined,
            notes: action.notes,
        });
    });

    const deliveries = Array.isArray(request?.update_deliveries) ? request.update_deliveries : [];
    deliveries.forEach((delivery) => {
        events.push({
            label: `Hotline update ${titleCase(delivery.delivery_status || 'pending')}`,
            at: delivery.submitted_at || delivery.last_attempted_at || delivery.created_at,
            detail: [
                supportRequestMessageLabel(delivery.message_type || delivery.status || 'support.request update'),
                Number.isFinite(Number(delivery.attempt_count)) ? `${Number(delivery.attempt_count)} attempt${Number(delivery.attempt_count) === 1 ? '' : 's'}` : '',
            ].filter(Boolean).join(' - '),
            errors: delivery.last_error,
        });
    });

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
                    ${event.notes ? `<p>${escapeHtml(event.notes)}</p>` : ''}
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

const supportRequestDetailMarkup = (request) => {
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
    const rationaleMarkup = supportRequestJustificationChips(request, 8) || supportRequestEmptyState('No support rationale labels');
    const contextMarkup = [
        supportRequestContextBlock('SITREP context', request.sitrep_context),
        supportRequestContextBlock('Gap context', request.gap_context),
        supportRequestContextBlock('Evidence context', request.evidence_row),
        supportRequestContextBlock('Incident refs', request.incident_refs),
    ].join('');
    return `
        <header class="support-request-detail-header">
            <div class="support-request-detail-kicker">
                <span class="support-request-status ${supportRequestStatusClass(request.status)}">${escapeHtml(supportRequestStatusLabel(request.status))}</span>
                ${request.urgency ? `<span class="support-request-urgency">${escapeHtml(titleCase(request.urgency))}</span>` : ''}
            </div>
            <h3>${escapeHtml(request.requested_assistance || capability || 'Support request')}</h3>
            <p>${escapeHtml(source)}</p>
            ${supportRequestFlowMarkup(request)}
            ${supportRequestActionButtonsMarkup(request)}
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
        ${supportRequestDetailSection('Support Rationale', rationaleMarkup, 'is-rationale')}
        ${supportRequestDetailSection('Operator Notes', operatorNotes ? `<div class="support-request-detail-grid">${operatorNotes}</div>` : supportRequestEmptyState('No operator notes attached'))}
        ${supportRequestDetailSection('Hotline Delivery', supportRequestDeliveryMarkup(request), 'is-delivery')}
        ${supportRequestDetailSection('SITREP And Gap Context', contextMarkup || supportRequestEmptyState('No context attached'))}
        ${supportRequestDetailSection('Lifecycle History', supportRequestLifecycleMarkup(request), 'is-history')}
    `;
};

const renderSupportRequestDetailContent = (detail, request, options = {}) => {
    if (!detail) return;

    if (!request) {
        detail.innerHTML = supportRequestEmptyState(
            options.emptyTitle || 'Select a request',
            options.emptyMessage || 'Details, context, and lifecycle history will appear here.',
        );
        return;
    }

    detail.innerHTML = supportRequestDetailMarkup(request);
    detail.querySelectorAll('[data-support-request-action]').forEach((button) => {
        button.addEventListener('click', () => openSupportRequestAction(request, button.dataset.supportRequestAction, options.onUpdated));
    });
};

const renderSupportRequestDetail = (request) => {
    renderSupportRequestDetailContent(
        supportRequestsModal?.body?.querySelector?.('[data-support-request-detail]'),
        request,
    );
};

const cachedSupportRequestById = (requestId) => supportRequestsData.find((item) => String(item?.id) === String(requestId || '')) || null;

const openSupportRequestAction = (request, action, onUpdated = null) => {
    const config = supportRequestActionConfigs[action];
    if (!config || !request?.id || supportRequestActionBusy) return;

    const renderUpdatedRequest = (nextRequest) => {
        if (typeof onUpdated === 'function') {
            onUpdated(nextRequest);
            return;
        }
        renderSupportRequestDetail(nextRequest);
    };

    const modal = helpers.createFormModal({
        title: config.title,
        submitLabel: config.submitLabel || config.label,
        busyMessage: config.busyMessage || 'Updating request...',
        size: 'sm',
        className: 'support-request-action-modal',
        initialValues: {},
        rows: config.rows || [],
        async onSubmit(values, ctx) {
            supportRequestActionBusy = true;
            renderUpdatedRequest({ ...request });

            try {
                const payload = Object.fromEntries(
                    Object.entries(values || {}).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]),
                );
                const data = await api(`/api/support-requests/${encodeURIComponent(request.id)}/${config.endpoint}`, {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });

                if (data.request) {
                    upsertCachedSupportRequest(data.request);
                    if (typeof onUpdated === 'function') {
                        onUpdated(data.request);
                    } else if (isCurrentSupportRequestSelection(data.request.id)) {
                        renderUpdatedRequest(data.request);
                    }
                }

                return true;
            } catch (error) {
                ctx.setErrors(normalizeErrors(fieldErrors(error)));
                if (!Object.keys(fieldErrors(error)).length) {
                    await helpers.uiAlert(firstError(error, 'Unable to update support request.'), {
                        title: 'Action failed',
                        variant: 'error',
                    });
                }
                return false;
            } finally {
                supportRequestActionBusy = false;
                const selected = supportRequestsData.find((item) => isCurrentSupportRequestSelection(item?.id));
                if (typeof onUpdated === 'function') {
                    onUpdated(cachedSupportRequestById(request?.id) || request);
                } else if (selected) {
                    renderUpdatedRequest(selected);
                }
            }
        },
    });

    modal.open();
};

const openSupportRequestDetail = async (requestId) => {
    const id = String(requestId || '');
    if (!id) return;

    const detail = supportRequestsModal?.body?.querySelector?.('[data-support-request-detail]');
    const cachedRequest = supportRequestsData.find((item) => String(item?.id) === id);
    const shouldAcknowledgeReview = String(cachedRequest?.status || '').toLowerCase() === 'requested';
    selectedSupportRequestId = id;
    syncSelectedSupportRequestCard();
    if (detail) {
        detail.innerHTML = supportRequestDetailLoadingMarkup();
        mountLoadingSkeletons(detail);
    }

    try {
        const data = shouldAcknowledgeReview
            ? await api(`/api/support-requests/${encodeURIComponent(id)}/receive`, {
                method: 'POST',
                body: '{}',
            })
            : await api(`/api/support-requests/${encodeURIComponent(id)}`);
        if (!isCurrentSupportRequestSelection(id)) {
            return;
        }

        if (data.request) {
            upsertCachedSupportRequest(data.request);
            renderSupportRequestDetail(data.request);
        }
    } catch (error) {
        if (!isCurrentSupportRequestSelection(id)) {
            return;
        }

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
            sitrep_relay_token: state.settings.sitrepRelayToken || state.settings.relayToken || '',
            support_request_relay_token: state.settings.supportRequestRelayToken || '',
            realtime_url: state.settings.realtimeUrl || 'https://realtime.pbb.ph',
            realtime_client_code: state.settings.realtimeClientCode || '',
            server_project_code: state.settings.serverProjectCode || '',
            admin_project_code: state.settings.adminProjectCode || '',
            account_sso_enabled: state.settings.accountSsoEnabled ? '1' : '0',
            account_base_url: state.settings.accountBaseUrl || 'https://account.pbb.ph',
            account_client_id: state.settings.accountClientId || 'pbb-support',
            account_client_secret: '',
            account_redirect_uri: state.settings.accountRedirectUri || 'https://support.pbb.ph/auth/account/callback',
            account_post_logout_redirect_uri: state.settings.accountPostLogoutRedirectUri || 'https://support.pbb.ph',
            account_scopes: state.settings.accountScopes || 'openid profile',
            account_timeout_seconds: state.settings.accountTimeoutSeconds || 10,
            account_ca_bundle: state.settings.accountCaBundle || '',
            account_admin_api_enabled: state.settings.accountAdminApiEnabled ? '1' : '0',
            account_admin_api_client: state.settings.accountAdminApiClient || 'pbb-account',
            account_admin_api_token: '',
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
                    name: 'sitrep_relay_token',
                    label: 'SITREP Relay Client Token',
                    placeholder: 'Token for SITREP Relay messages',
                },
            ],
            [
                {
                    type: 'input',
                    input: 'password',
                    name: 'support_request_relay_token',
                    label: 'Support Request Relay Client Token',
                    placeholder: 'Token for support request lifecycle messages',
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
                    type: 'select',
                    name: 'account_sso_enabled',
                    label: 'Enable Account SSO',
                    options: [
                        { value: '1', label: 'Enabled' },
                        { value: '0', label: 'Disabled' },
                    ],
                },
            ],
            [
                {
                    type: 'input',
                    input: 'url',
                    name: 'account_base_url',
                    label: 'Account URL',
                    placeholder: 'https://account.pbb.ph',
                },
            ],
            [
                {
                    type: 'input',
                    name: 'account_client_id',
                    label: 'Account Client ID',
                    placeholder: 'pbb-support',
                },
            ],
            [
                {
                    type: 'input',
                    input: 'password',
                    name: 'account_client_secret',
                    label: state.settings.accountClientSecretConfigured
                        ? 'Account Client Secret (configured; enter new value to rotate)'
                        : 'Account Client Secret',
                    placeholder: state.settings.accountClientSecretConfigured ? 'Leave blank to keep current secret' : 'Enter client secret',
                },
            ],
            [
                {
                    type: 'input',
                    input: 'url',
                    name: 'account_redirect_uri',
                    label: 'Account Callback URL',
                    placeholder: 'https://support.pbb.ph/auth/account/callback',
                },
            ],
            [
                {
                    type: 'input',
                    input: 'url',
                    name: 'account_post_logout_redirect_uri',
                    label: 'Account Post Logout URL',
                    placeholder: 'https://support.pbb.ph',
                },
            ],
            [
                {
                    type: 'input',
                    name: 'account_scopes',
                    label: 'Account Scopes',
                    placeholder: 'openid profile',
                },
            ],
            [
                {
                    type: 'input',
                    input: 'number',
                    name: 'account_timeout_seconds',
                    label: 'Account timeout (seconds)',
                    min: 1,
                    step: 1,
                    placeholder: '10',
                },
            ],
            [
                {
                    type: 'input',
                    name: 'account_ca_bundle',
                    label: 'Account CA bundle path',
                    placeholder: 'Optional local CA bundle path',
                },
            ],
            [
                {
                    type: 'select',
                    name: 'account_admin_api_enabled',
                    label: 'Enable Account App Admin API',
                    options: [
                        { value: '1', label: 'Enabled' },
                        { value: '0', label: 'Disabled' },
                    ],
                },
            ],
            [
                {
                    type: 'input',
                    name: 'account_admin_api_client',
                    label: 'Account App Admin Client',
                    placeholder: 'pbb-account',
                },
            ],
            [
                {
                    type: 'input',
                    input: 'password',
                    name: 'account_admin_api_token',
                    label: state.settings.accountAdminApiTokenConfigured
                        ? 'Account App Admin Token (configured; enter new value to rotate)'
                        : 'Account App Admin Token',
                    placeholder: state.settings.accountAdminApiTokenConfigured ? 'Leave blank to keep current token' : 'Enter app-admin token',
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
    if (state.app?.accountSso?.enabled && state.app?.accountSso?.logoutUrl) {
        redirectToAccountLogout();
        return;
    }

    const data = await api('/api/logout', { method: 'POST', body: '{}' });
    closeSupportRequests();
    resetSupportRequestsCache();
    closeUsers();
    resetUsersCache();
    setSessionRemembered(false);
    applySessionPayload(data);
    state.account = null;
    state.reauthOpen = false;
    disconnectSourceHeartbeatRealtime();
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
