<?php

namespace App\Support\Sitreps;

use App\Models\ConsolidatedSitrep;
use App\Models\SitrepStaging;
use App\Support\Settings\SupportSettings;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Pbb\Sitreps\Consolidation\SitrepConsolidator;
use Pbb\Sitreps\Consolidation\SitrepValidationIssue;

class SitrepConsolidationService
{
    public function __construct(
        private readonly SitrepConsolidator $consolidator,
        private readonly SupportSettings $settings,
    ) {
    }

    public function consolidate(): ConsolidatedSitrep
    {
        $staged = SitrepStaging::query()
            ->orderBy('source_deployment')
            ->orderBy('source_hub_name')
            ->get();

        $grouped = $staged->groupBy('source_deployment');
        $deployment = (string) $grouped->keys()->first();
        $batch = $deployment !== ''
            ? $grouped->get($deployment)->map(fn (SitrepStaging $staging): array => $staging->normalized_sitrep)->all()
            : [];

        $context = $this->context($staged);
        $result = $this->consolidator->consolidate($batch, $context);
        $settings = $this->settings->all();
        $alertLevel = (string) ($settings['alertLevel'] ?? 'Normal');
        $computedAlertLevel = (string) ($result->sitrep['alert_level'] ?? 'Normal');
        $payload = $result->sitrep;

        if ($payload !== null) {
            $payload['alert_level'] = $alertLevel;
            $payload = $this->applyLocalPolicy($payload, $computedAlertLevel);
        }

        return DB::transaction(function () use ($result, $payload, $alertLevel, $computedAlertLevel): ConsolidatedSitrep {
            ConsolidatedSitrep::query()
                ->where('status', ConsolidatedSitrep::STATUS_CURRENT)
                ->update(['status' => ConsolidatedSitrep::STATUS_SUPERSEDED]);

            \App\Models\SitrepRelayDelivery::query()
                ->whereIn('status', [
                    \App\Models\SitrepRelayDelivery::STATUS_PENDING,
                    \App\Models\SitrepRelayDelivery::STATUS_FAILED,
                ])
                ->update(['status' => \App\Models\SitrepRelayDelivery::STATUS_SUPERSEDED]);

            $consolidated = ConsolidatedSitrep::query()->create([
                'status' => $result->ok ? ConsolidatedSitrep::STATUS_CURRENT : ConsolidatedSitrep::STATUS_FAILED,
                'alert_level' => $alertLevel,
                'computed_source_alert_level' => $computedAlertLevel,
                'source_sitrep_count' => count($result->sourceIndex),
                'sitrep_payload' => $payload,
                'source_index' => $result->sourceIndex,
                'validation_issues' => $this->issueArrays($result->issues),
                'consolidated_at' => now(),
            ]);

            if ($result->ok) {
                app(SitrepRelayOutboxService::class)->queue($consolidated);
            }

            return $consolidated;
        });
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function applyLocalPolicy(array $payload, string $computedAlertLevel): array
    {
        $localPolicy = [
            'alert_level_source' => 'manual_local_leadership',
            'computed_source_alert_level' => $computedAlertLevel,
        ];

        if (is_array($payload['source_snapshot']['rollup'] ?? null)) {
            $payload['source_snapshot']['rollup']['local_policy'] = $localPolicy;

            return $payload;
        }

        $payload['source_snapshot'] = is_array($payload['source_snapshot'] ?? null)
            ? $payload['source_snapshot']
            : [];
        $payload['source_snapshot']['local_policy'] = $localPolicy;

        return $payload;
    }

    /**
     * @param \Illuminate\Support\Collection<int, SitrepStaging> $staged
     * @return array<string, mixed>
     */
    private function context($staged): array
    {
        $hub = $this->hubIdentity();

        return [
            'target_hub_id' => $hub['hub_id'] ?? null,
            'target_hub_name' => $hub['name'] ?? config('app.name', 'PBB Support System'),
            'target_level' => $hub['deployment'] ?? 'support',
            'target_hub_node' => $this->targetHubNode($hub),
            'coverage_area' => $hub['name'] ?? config('app.name', 'PBB Support System'),
            'period_started_at' => optional($staged->min('period_started_at'))?->toIso8601String(),
            'period_ended_at' => optional($staged->max('period_ended_at'))?->toIso8601String(),
        ];
    }

    /**
     * @param array<string, mixed> $hub
     * @return array<string, mixed>
     */
    private function targetHubNode(array $hub): array
    {
        if ($hub === []) {
            return [];
        }

        return [
            'available' => true,
            'source' => 'relay_hub_json',
            'snapshot' => $hub,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function hubIdentity(): array
    {
        return Cache::remember('relay.hub_identity_for_consolidation', now()->addSeconds(30), function (): array {
            $url = (string) config('services.relay.hub_json_url', 'https://relay.pbb.ph/hub.json');

            try {
                $payload = Http::acceptJson()->timeout(5)->get($url)->throw()->json();
            } catch (\Throwable) {
                return [];
            }

            return is_array($payload) ? $payload : [];
        });
    }

    /**
     * @param SitrepValidationIssue[] $issues
     * @return array<int, array<string, mixed>>
     */
    private function issueArrays(array $issues): array
    {
        return array_map(
            static fn (SitrepValidationIssue $issue): array => $issue->toArray(),
            $issues,
        );
    }
}
