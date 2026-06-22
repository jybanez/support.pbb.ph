export const sourceHeartbeatKeys = (source = {}) => [
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

export const heartbeatKeys = (heartbeat = {}) => [
    heartbeat?.source_hub_id,
    heartbeat?.source_relay_hub_id,
    heartbeat?.hub_id,
    heartbeat?.relay_hub_id,
]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

export const mergeSourceHeartbeats = (sources = [], heartbeats = []) => {
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

export const mergeHeartbeatCache = (existing = [], incoming = [], { replace = false } = {}) => {
    const rows = Array.isArray(incoming) ? incoming : [];
    if (replace) return rows;

    const merged = [];
    const byKey = new Map();

    const indexRow = (row, index) => {
        heartbeatKeys(row).forEach((key) => {
            if (!byKey.has(key)) {
                byKey.set(key, index);
            }
        });
    };

    (Array.isArray(existing) ? existing : []).forEach((row) => {
        const index = merged.length;
        merged.push(row);
        indexRow(row, index);
    });

    rows.forEach((row) => {
        const matchIndex = heartbeatKeys(row)
            .map((key) => byKey.get(key))
            .find((index) => Number.isInteger(index));

        if (Number.isInteger(matchIndex)) {
            merged[matchIndex] = {
                ...merged[matchIndex],
                ...row,
            };
            indexRow(merged[matchIndex], matchIndex);
            return;
        }

        const index = merged.length;
        merged.push(row);
        indexRow(row, index);
    });

    return merged;
};
