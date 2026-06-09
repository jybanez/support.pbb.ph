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

const sectionHeadings = {
    priorities: 'Priority Support Review',
    packages: 'Support Package Options',
    decisions: 'Leadership Decisions',
    matching: 'Resource Matching',
    clarifications: 'Clarifications Needed',
    commitments: 'Draft Commitments',
};

const toneClass = (card = {}) => {
    const value = String(card.priority_level || card.status || card.availability_status || '').toLowerCase();

    if (value.includes('critical')) return 'is-alert-critical';
    if (value.includes('high') || value.includes('draft') || value.includes('unknown')) return 'is-alert-warning';
    return 'is-alert-info';
};

const listMarkup = (title, items, limit = 5) => {
    if (!Array.isArray(items) || !items.length) {
        return '';
    }

    return `
        <div class="support-strategy-card-list">
            <span>${escapeHtml(title)}</span>
            <ul>
                ${items.slice(0, limit).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
        </div>
    `;
};

const sentence = (value) => {
    const text = String(value ?? '').trim();
    if (!text) return '';
    return /[.!?]$/.test(text) ? text : `${text}.`;
};

const humanizeEvidenceItem = (item, card = {}) => {
    const text = String(item ?? '').trim();
    if (!text) return '';

    const lower = text.toLowerCase();

    if (lower.includes('open report')) return sentence(text);
    if (lower.includes('active report')) return sentence(`${text} still active`);
    if (lower.includes('current assignment')) return sentence(`${text} currently active`);
    if (lower.includes('requested resource unit')) return sentence(`${text} across support needs`);
    if (lower.includes('person at risk') || lower.includes('people at risk')) return sentence(text);
    if (lower.includes('critical alert level')) return 'Critical alert level.';
    if (lower.includes('elevated alert level')) return 'Elevated alert level.';
    if (lower.includes('gap')) return 'Response or confidence gaps require review.';
    if (lower.includes('concern signal')) return sentence(`${text.replace(/ concern signal$/i, '')} concern signal reported`);
    if (lower.includes('no resource availability registry')) return 'No connected resource availability registry confirms available supply.';
    if (lower.includes('missing source snapshot timestamp')) return 'Source freshness timestamp is unavailable and should be validated.';

    return sentence(text);
};

const humanEvidenceItems = (card = {}) => {
    const evidence = Array.isArray(card.based_on) ? card.based_on : [];
    return evidence
        .map((item) => humanizeEvidenceItem(item, card))
        .filter(Boolean)
        .slice(0, 3);
};

const actionItems = (tabId, card = {}) => {
    const normalize = (item) => String(item ?? '')
        .replace(/\.$/, '')
        .replace(/^Review requested demand as unconfirmed supply$/i, 'Confirm unmet resource demand')
        .replace(/^Prepare leadership review for urgent support$/i, 'Prepare urgent support review')
        .replace(/^Verify available resources before committing support$/i, 'Verify available resources')
        .trim();
    const compact = (items) => items.map(normalize).filter(Boolean).slice(0, 2);

    if (Array.isArray(card.recommended_next_steps) && card.recommended_next_steps.length) {
        return compact(card.recommended_next_steps);
    }
    if (Array.isArray(card.recommended_actions) && card.recommended_actions.length) {
        return compact(card.recommended_actions);
    }
    if (card.suggested_action) {
        return compact([card.suggested_action]);
    }
    if (tabId === 'matching') {
        return ['Verify available resources before committing support.'];
    }
    if (tabId === 'clarifications' && card.question) {
        return [card.question];
    }
    return ['Review details before assigning or communicating support.'];
};

const validationItems = (tabId, card = {}) => {
    const items = [];
    const status = String(card.availability_status || card.status || '').toLowerCase();

    if (Array.isArray(card.based_on) && card.based_on.some((item) => String(item).toLowerCase().includes('gap'))) {
        items.push('Confirm reported response or confidence gaps with the source hub.');
    }
    if (status.includes('unknown')) {
        items.push('Confirm available supply for the requested resources.');
    }
    if (status.includes('draft')) {
        items.push('Leadership approval is required before this becomes a commitment.');
    }
    if (tabId === 'matching') {
        items.push('Available supply is not confirmed for this demand category.');
    }
    if (tabId === 'clarifications') {
        items.push(card.reason || 'Field validation is required before action is finalized.');
    }

    return [...new Set(items)].slice(0, 1);
};

const whyText = (tabId, card = {}) => {
    if (tabId === 'packages') {
        const facts = [
            Number(card.open_reports || 0) > 0 ? `${card.open_reports} open reports` : '',
            Number(card.requested_resource_units || 0) > 0 ? `${card.requested_resource_units} requested resource units` : '',
        ].filter(Boolean);
        return facts.length
            ? sentence(`${facts.join(' and ')} indicate this package should be prepared for review`)
            : sentence(card.summary || 'This support package should be prepared for review');
    }

    if (tabId === 'matching') {
        return sentence(`${card.requested || 'Requested'} ${card.demand_category || 'resource units'} are reported, but available supply is not confirmed`);
    }

    if (tabId === 'clarifications') {
        return sentence(card.reason || 'Clarification is needed before action is finalized');
    }

    return sentence(card.summary || 'This item needs review before support is assigned or communicated');
};

const technicalDetailsMarkup = (card = {}) => {
    const refs = Array.isArray(card.evidence_refs) ? card.evidence_refs.filter(Boolean) : [];
    if (!refs.length) return '';

    return `
        <details class="support-strategy-technical">
            <summary>Technical provenance</summary>
            <ul>
                ${refs.map((ref) => `<li>${escapeHtml(ref)}</li>`).join('')}
            </ul>
        </details>
    `;
};

const sectionTextMarkup = (title, value) => {
    const text = sentence(value);
    if (!text) return '';

    return `
        <div class="support-strategy-card-note">
            <span>${escapeHtml(title)}</span>
            <p>${escapeHtml(text)}</p>
        </div>
    `;
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
    const evidence = humanEvidenceItems(card);
    const validation = validationItems(tabId, card);

    return `
        ${sectionTextMarkup('Why it matters', whyText(tabId, card))}
        ${listMarkup('Recommended action', actionItems(tabId, card), 2)}
        ${listMarkup('Evidence supporting this', evidence, 3)}
        ${sectionTextMarkup('Validation needed', validation[0])}
        ${technicalDetailsMarkup(card)}
    `;
};

const cardActions = (card) => {
    const sourceId = String(card.source_hub_id || '').trim();
    const evidenceRef = Array.isArray(card.evidence_refs) ? String(card.evidence_refs[0] || '') : '';

    return `
        <div class="support-strategy-actions">
            <button type="button" class="ui-button ui-button-quiet support-strategy-action-button" data-strategy-action="evidence" data-evidence-ref="${escapeHtml(evidenceRef)}">Review Details</button>
            ${sourceId ? `<button type="button" class="ui-button ui-button-quiet support-strategy-action-button" data-strategy-action="map" data-source-hub-id="${escapeHtml(sourceId)}">Show on Map</button>` : ''}
            <button type="button" class="ui-button ui-button-quiet support-strategy-action-button" data-strategy-action="review" data-card-id="${escapeHtml(card.id || '')}">Mark Reviewed</button>
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
            ${cardActions(card)}
        </article>
    `;
};

const sectionHeadMarkup = (tabId) => {
    const tab = strategyTabs.find((item) => item.id === tabId);
    const label = tab?.label || titleCase(tabId);
    const heading = sectionHeadings[tabId] || label;

    return `
        <div class="sitrep-section-head support-strategy-section-head">
            <p class="sitrep-eyebrow">${escapeHtml(label)}</p>
            <h2>${escapeHtml(heading)}</h2>
        </div>
    `;
};

export function renderSupportStrategy(container, supportStrategy, callbacks = {}) {
    if (!container) return;

    if (supportStrategy.loading) {
        container.innerHTML = `
            <div class="support-strategy-panel">
                <header class="support-current-sitrep-header support-panel-header support-strategy-header">
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
                <header class="support-current-sitrep-header support-panel-header support-strategy-header">
                    <div>
                        <h2>SUPPORT STRATEGY</h2>
                        <p>Strategy unavailable</p>
                    </div>
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
                <header class="support-current-sitrep-header support-panel-header support-strategy-header">
                    <div>
                        <h2>SUPPORT STRATEGY</h2>
                        <p>No current strategy</p>
                    </div>
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
    const rawGenerated = supportStrategy.data.source_generated_at || supportStrategy.data.generated_at || '';
    const generated = callbacks.formatTimestamp?.(rawGenerated) || rawGenerated;
    const strategy = supportStrategy.data.strategy;
    const cards = Array.isArray(strategy[activeTab]) ? strategy[activeTab] : [];

    container.innerHTML = `
        <div class="support-strategy-panel">
            <header class="support-current-sitrep-header support-panel-header support-strategy-header">
                <div>
                    <h2>SUPPORT STRATEGY</h2>
                    ${generated ? `<p>${escapeHtml(generated)}</p>` : ''}
                </div>
            </header>
            <nav class="support-current-sitrep-tabs support-strategy-tabs" role="tablist" aria-label="Support strategy sections">
                ${strategyTabs.map((tab) => `
                    <button
                        type="button"
                        role="tab"
                        class="support-current-sitrep-tab support-strategy-tab${tab.id === activeTab ? ' is-active' : ''}"
                        aria-selected="${tab.id === activeTab ? 'true' : 'false'}"
                        data-strategy-tab="${escapeHtml(tab.id)}"
                    >${escapeHtml(tab.label)}</button>
                `).join('')}
            </nav>
            <div class="support-strategy-content" role="tabpanel">
                ${sectionHeadMarkup(activeTab)}
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
        button.addEventListener('click', () => callbacks.onViewEvidence?.(button.dataset.evidenceRef || ''));
    });
}
