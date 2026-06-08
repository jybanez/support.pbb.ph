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

export const strategyTabs = [
    { id: 'priorities', label: 'Priorities' },
    { id: 'packages', label: 'Packages' },
    { id: 'decisions', label: 'Decisions' },
    { id: 'matching', label: 'Matching' },
    { id: 'clarifications', label: 'Clarifications' },
    { id: 'commitments', label: 'Commitments' },
];

const tabEmptyText = {
    priorities: 'No priority support cards were derived from the current SITREP.',
    packages: 'No support packages were derived from the current SITREP.',
    decisions: 'No leadership decision cards were derived from the current SITREP.',
    matching: 'No resource demand categories were found for matching.',
    clarifications: 'No clarification questions were derived from the current SITREP.',
    commitments: 'No support commitments have been drafted yet.',
};

const toneClass = (card = {}) => {
    const value = String(card.priority_level || card.status || card.availability_status || '').toLowerCase();

    if (value.includes('critical')) return 'is-alert-critical';
    if (value.includes('high') || value.includes('draft') || value.includes('unknown')) return 'is-alert-warning';
    return 'is-alert-info';
};

const listMarkup = (title, items) => {
    if (!Array.isArray(items) || !items.length) {
        return '';
    }

    return `
        <div class="support-strategy-card-list">
            <span>${escapeHtml(title)}</span>
            <ul>
                ${items.slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
        </div>
    `;
};

const metricMarkup = (label, value) => {
    if (value === null || value === undefined || value === '' || Number(value) === 0) {
        return '';
    }

    return `<span><strong>${escapeHtml(value)}</strong>${escapeHtml(label)}</span>`;
};

const cardTitle = (tabId, card) => {
    if (tabId === 'priorities') {
        return `#${escapeHtml(card.rank || '')} ${escapeHtml(card.source_hub_name || card.title || 'Priority review')}`;
    }

    if (tabId === 'matching') {
        return escapeHtml(card.demand_category || card.title || 'Resource demand');
    }

    if (tabId === 'clarifications') {
        return escapeHtml(card.question || card.title || 'Clarification');
    }

    return escapeHtml(card.title || card.trigger_concern_group || 'Support strategy');
};

const cardBody = (tabId, card) => {
    if (tabId === 'matching') {
        return `
            <p>${escapeHtml(card.suggested_action || 'Verify availability before committing support.')}</p>
            <div class="support-strategy-metrics">
                ${metricMarkup('requested', card.requested)}
                <span><strong>Unknown</strong>availability</span>
            </div>
        `;
    }

    if (tabId === 'packages') {
        return `
            <p>${escapeHtml(card.summary || '')}</p>
            <div class="support-strategy-metrics">
                ${metricMarkup('open reports', card.open_reports)}
                ${metricMarkup('requested', card.requested_resource_units)}
            </div>
            ${listMarkup('Actions', card.recommended_actions)}
            ${listMarkup('Resources', card.suggested_resources)}
        `;
    }

    if (tabId === 'clarifications') {
        return `
            <p>${escapeHtml(card.reason || card.summary || '')}</p>
            ${card.target ? `<p class="support-strategy-target">To: ${escapeHtml(card.target)}</p>` : ''}
        `;
    }

    if (tabId === 'commitments') {
        return `<p>${escapeHtml(card.summary || '')}</p>`;
    }

    return `
        <p>${escapeHtml(card.summary || card.suggested_action || '')}</p>
        ${listMarkup('Next steps', card.recommended_next_steps ? card.recommended_next_steps : [card.suggested_action].filter(Boolean))}
    `;
};

const cardActions = (card) => {
    const sourceId = String(card.source_hub_id || '').trim();

    return `
        <div class="support-strategy-actions">
            <button type="button" data-strategy-action="evidence">View Evidence</button>
            ${sourceId ? `<button type="button" data-strategy-action="map" data-source-hub-id="${escapeHtml(sourceId)}">View on Map</button>` : ''}
            <button type="button" data-strategy-action="review" data-card-id="${escapeHtml(card.id || '')}">Mark Reviewed</button>
        </div>
    `;
};

const cardMarkup = (tabId, card, reviewedIds) => {
    const cardId = String(card.id || '');
    const reviewed = reviewedIds?.has?.(cardId);

    return `
        <article class="support-strategy-card ${toneClass(card)}${reviewed ? ' is-reviewed' : ''}" data-strategy-card-id="${escapeHtml(cardId)}">
            <header>
                <div>
                    <span>${escapeHtml(titleCase(card.priority_level || card.status || card.availability_status || tabId))}</span>
                    <h3>${cardTitle(tabId, card)}</h3>
                </div>
                ${reviewed ? '<em>Reviewed</em>' : ''}
            </header>
            ${cardBody(tabId, card)}
            ${listMarkup('Based on', card.based_on)}
            ${listMarkup('Evidence', card.evidence_refs)}
            ${cardActions(card)}
        </article>
    `;
};

export function renderSupportStrategy(container, supportStrategy, callbacks = {}) {
    if (!container) return;

    if (supportStrategy.loading) {
        container.innerHTML = `
            <div class="support-strategy-panel">
                <header class="support-strategy-header">
                    <div data-skeleton data-skeleton-lines="2"></div>
                </header>
                <div class="support-strategy-loading-tabs" data-skeleton data-skeleton-variant="grid" data-skeleton-columns="3" data-skeleton-rows="2"></div>
                <div class="support-strategy-loading-list">
                    ${Array.from({ length: 3 }).map(() => '<article class="support-strategy-card is-loading" data-skeleton data-skeleton-lines="6"></article>').join('')}
                </div>
            </div>
        `;
        callbacks.onSkeleton?.(container);
        return;
    }

    if (supportStrategy.error) {
        container.innerHTML = `
            <div class="support-strategy-panel">
                <header class="support-strategy-header">
                    <p class="ui-eyebrow">Support Strategy</p>
                    <h2>Strategy unavailable</h2>
                </header>
                <div class="support-strategy-empty">
                    <p>${escapeHtml(supportStrategy.error)}</p>
                </div>
            </div>
        `;
        return;
    }

    if (!supportStrategy.available || !supportStrategy.data?.strategy) {
        container.innerHTML = `
            <div class="support-strategy-panel">
                <header class="support-strategy-header">
                    <p class="ui-eyebrow">Support Strategy</p>
                    <h2>No current strategy</h2>
                </header>
                <div class="support-strategy-empty">
                    <p>Support strategy will appear after the current consolidated SITREP is available.</p>
                </div>
            </div>
        `;
        return;
    }

    const activeTab = strategyTabs.some((tab) => tab.id === supportStrategy.activeTab)
        ? supportStrategy.activeTab
        : 'priorities';
    const generated = supportStrategy.data.source_generated_at || supportStrategy.data.generated_at || '';
    const strategy = supportStrategy.data.strategy;
    const cards = Array.isArray(strategy[activeTab]) ? strategy[activeTab] : [];

    container.innerHTML = `
        <div class="support-strategy-panel">
            <header class="support-strategy-header">
                <p class="ui-eyebrow">Support Strategy</p>
                <h2>${escapeHtml(supportStrategy.data.coverage_area || 'Current SITREP')}</h2>
                ${generated ? `<p>${escapeHtml(generated)}</p>` : ''}
            </header>
            <nav class="support-strategy-tabs" role="tablist" aria-label="Support strategy sections">
                ${strategyTabs.map((tab) => `
                    <button
                        type="button"
                        role="tab"
                        class="support-strategy-tab${tab.id === activeTab ? ' is-active' : ''}"
                        aria-selected="${tab.id === activeTab ? 'true' : 'false'}"
                        data-strategy-tab="${escapeHtml(tab.id)}"
                    >${escapeHtml(tab.label)}</button>
                `).join('')}
            </nav>
            <div class="support-strategy-content" role="tabpanel">
                ${cards.length
                    ? cards.map((card) => cardMarkup(activeTab, card, supportStrategy.reviewedIds)).join('')
                    : `<div class="support-strategy-empty"><p>${escapeHtml(tabEmptyText[activeTab] || 'No strategy cards available.')}</p></div>`}
            </div>
        </div>
    `;

    container.querySelectorAll('[data-strategy-tab]').forEach((button) => {
        button.addEventListener('click', () => callbacks.onTab?.(button.dataset.strategyTab || 'priorities'));
    });

    container.querySelectorAll('[data-strategy-action="map"]').forEach((button) => {
        button.addEventListener('click', () => callbacks.onViewMap?.(button.dataset.sourceHubId || ''));
    });

    container.querySelectorAll('[data-strategy-action="review"]').forEach((button) => {
        button.addEventListener('click', () => callbacks.onReviewed?.(button.dataset.cardId || ''));
    });

    container.querySelectorAll('[data-strategy-action="evidence"]').forEach((button) => {
        button.addEventListener('click', () => callbacks.onViewEvidence?.());
    });
}
