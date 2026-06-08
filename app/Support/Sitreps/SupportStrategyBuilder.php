<?php

namespace App\Support\Sitreps;

use App\Models\ConsolidatedSitrep;
use Illuminate\Support\Str;

class SupportStrategyBuilder
{
    /**
     * @param array<string, mixed> $payload
     * @return array<string, array<int, array<string, mixed>>>
     */
    public function build(array $payload, ConsolidatedSitrep $current): array
    {
        $sources = $this->sourceProfiles($payload);
        $needs = $this->needRows($payload);
        $routeGaps = $this->routeGaps($payload);
        $populationNotes = $this->populationNotes($payload);

        return [
            'priorities' => $this->priorities($sources),
            'packages' => $this->packages($payload, $needs, $sources),
            'decisions' => $this->decisions($sources, $needs, $routeGaps),
            'matching' => $this->matching($needs),
            'clarifications' => $this->clarifications($routeGaps, $populationNotes, $needs, $sources),
            'commitments' => [],
        ];
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<int, array<string, mixed>>
     */
    private function sourceProfiles(array $payload): array
    {
        $hubNodes = data_get($payload, 'source_snapshot.rollup.hub_nodes');
        $summaryItems = $this->sectionItems($payload, 'summary');
        $situationItems = $this->sectionItems($payload, 'situation');
        $populationItems = $this->sectionItems($payload, 'population');
        $needsItems = $this->sectionItems($payload, 'needs');
        $sourceAlerts = $this->sourceAlertLevels($payload);
        $profiles = [];

        if (is_array($hubNodes)) {
            foreach ($hubNodes as $index => $source) {
                if (! is_array($source)) {
                    continue;
                }

                $snapshot = is_array($source['snapshot'] ?? null) ? $source['snapshot'] : [];
                $relayHubId = $this->text($source['source_relay_hub_id'] ?? $snapshot['relay_hub_id'] ?? $source['relay_hub_id'] ?? null);
                $sourceHubId = $this->text($source['source_hub_id'] ?? $snapshot['hub_id'] ?? $source['hub_id'] ?? null)
                    ?? $relayHubId;

                if ($sourceHubId === null) {
                    continue;
                }

                $aliases = array_values(array_unique(array_filter([
                    $sourceHubId,
                    $relayHubId,
                    $this->text($source['source_hub_id'] ?? null),
                    $this->text($snapshot['hub_id'] ?? null),
                    $this->text($source['hub_id'] ?? null),
                    $this->text($source['relay_hub_id'] ?? null),
                ])));

                $profiles[$sourceHubId] = [
                    'source_hub_id' => $sourceHubId,
                    'source_relay_hub_id' => $relayHubId,
                    'source_hub_name' => $this->text($snapshot['name'] ?? $source['source_hub_name'] ?? $source['name'] ?? null) ?? 'Source hub',
                    'deployment' => $this->text($snapshot['deployment'] ?? $source['deployment'] ?? null),
                    'alert_level' => $this->text($source['alert_level'] ?? $snapshot['alert_level'] ?? null) ?? $this->firstAlert($sourceAlerts, $aliases),
                    'snapshot_at' => $this->text($snapshot['snapshot_at'] ?? $source['snapshot_at'] ?? null),
                    'aliases' => $aliases,
                    'score' => 0,
                    'based_on' => [],
                    'recommended_next_steps' => [],
                    'evidence_refs' => [
                        sprintf('source_snapshot.rollup.hub_nodes[%d]', $index),
                    ],
                ];
            }
        }

        foreach ($summaryItems as $index => $item) {
            $profile = $this->profileForItem($profiles, $item);
            if ($profile === null) {
                continue;
            }

            $data = is_array($item['data'] ?? null) ? $item['data'] : [];
            $metrics = is_array($data['supporting_metrics'] ?? null) ? $data['supporting_metrics'] : [];
            $openReports = $this->number($metrics['open_reports'] ?? data_get($data, 'current_operating_picture.open_reports'));
            $resourceUnits = $this->number($metrics['resource_need_units'] ?? data_get($data, 'current_operating_picture.current_resource_units'));
            $dominantConcern = $this->text($data['dominant_incident_type'] ?? $data['primary_concern'] ?? null);

            if ($openReports > 0) {
                $profiles[$profile]['score'] += min(20, $openReports);
                $profiles[$profile]['based_on'][] = $this->plural($openReports, 'open report');
            }

            if ($resourceUnits > 0) {
                $profiles[$profile]['score'] += min(30, $resourceUnits);
                $profiles[$profile]['based_on'][] = $this->plural($resourceUnits, 'requested resource unit');
                $profiles[$profile]['recommended_next_steps'][] = 'Check support resource matching';
            }

            if ($dominantConcern !== null) {
                $profiles[$profile]['based_on'][] = $dominantConcern.' concern signal';
            }

            if (($data['gap_cards'] ?? []) !== []) {
                $profiles[$profile]['score'] += 12;
                $profiles[$profile]['based_on'][] = 'Reported response or confidence gaps';
                $profiles[$profile]['evidence_refs'][] = sprintf('summary.items[%d].data.gap_cards', $index);
            }

            $profiles[$profile]['evidence_refs'][] = sprintf('summary.items[%d].data.supporting_metrics', $index);
        }

        foreach ($situationItems as $index => $item) {
            $profile = $this->profileForItem($profiles, $item);
            if ($profile === null) {
                continue;
            }

            $picture = data_get($item, 'data.current_operating_picture');
            $picture = is_array($picture) ? $picture : [];
            $assignments = $this->number($picture['current_assignments'] ?? null);
            $activeReports = $this->number($picture['active_reports'] ?? null);
            $deferredReports = $this->number($picture['deferred_reports'] ?? null);

            if ($assignments > 0) {
                $profiles[$profile]['score'] += min(12, $assignments * 2);
                $profiles[$profile]['based_on'][] = $this->plural($assignments, 'current assignment');
            }

            if ($activeReports > 0) {
                $profiles[$profile]['score'] += min(15, $activeReports);
                $profiles[$profile]['based_on'][] = $this->plural($activeReports, 'active report');
            }

            if ($deferredReports > 0) {
                $profiles[$profile]['score'] += min(10, $deferredReports);
                $profiles[$profile]['based_on'][] = $this->plural($deferredReports, 'deferred report');
            }

            $profiles[$profile]['evidence_refs'][] = sprintf('situation.items[%d].data.current_operating_picture', $index);
        }

        foreach ($populationItems as $index => $item) {
            $profile = $this->profileForItem($profiles, $item);
            if ($profile === null) {
                continue;
            }

            $peopleAtRisk = $this->number(data_get($item, 'data.people_at_risk') ?? data_get($item, 'data.numeric_total'));

            if ($peopleAtRisk > 0) {
                $profiles[$profile]['score'] += min(30, $peopleAtRisk);
                $profiles[$profile]['based_on'][] = $this->plural($peopleAtRisk, 'person at risk', 'people at risk');
                $profiles[$profile]['recommended_next_steps'][] = 'Review life-safety support needs';
                $profiles[$profile]['evidence_refs'][] = sprintf('population.items[%d].data.people_at_risk', $index);
            }
        }

        foreach ($needsItems as $index => $item) {
            $profile = $this->profileForItem($profiles, $item);
            if ($profile === null) {
                continue;
            }

            $quantity = collect($this->rows(data_get($item, 'data.items')))
                ->sum(fn (array $row): int => $this->number($row['quantity_requested'] ?? $row['quantity'] ?? null));

            if ($quantity > 0) {
                $profiles[$profile]['score'] += min(30, $quantity);
                $profiles[$profile]['based_on'][] = $this->plural($quantity, 'requested resource unit');
                $profiles[$profile]['recommended_next_steps'][] = 'Review requested demand as unconfirmed supply';
                $profiles[$profile]['evidence_refs'][] = sprintf('needs.items[%d].data.items', $index);
            }
        }

        foreach ($profiles as $sourceHubId => $profile) {
            $alert = strtolower((string) ($profile['alert_level'] ?? ''));

            if ($alert === 'critical') {
                $profiles[$sourceHubId]['score'] += 50;
                $profiles[$sourceHubId]['based_on'][] = 'Critical alert level';
                $profiles[$sourceHubId]['recommended_next_steps'][] = 'Prepare leadership review for urgent support';
            } elseif ($alert === 'elevated') {
                $profiles[$sourceHubId]['score'] += 25;
                $profiles[$sourceHubId]['based_on'][] = 'Elevated alert level';
            }

            if ($profiles[$sourceHubId]['recommended_next_steps'] === []) {
                $profiles[$sourceHubId]['recommended_next_steps'][] = 'Review SITREP evidence before assigning support';
            }

            $profiles[$sourceHubId]['based_on'] = array_values(array_unique($profiles[$sourceHubId]['based_on']));
            $profiles[$sourceHubId]['recommended_next_steps'] = array_values(array_unique($profiles[$sourceHubId]['recommended_next_steps']));
            $profiles[$sourceHubId]['evidence_refs'] = array_values(array_unique($profiles[$sourceHubId]['evidence_refs']));
        }

        return array_values($profiles);
    }

    /**
     * @param array<int, array<string, mixed>> $sources
     * @return array<int, array<string, mixed>>
     */
    private function priorities(array $sources): array
    {
        usort($sources, fn (array $a, array $b): int => [$b['score'], $a['source_hub_name']] <=> [$a['score'], $b['source_hub_name']]);

        return collect($sources)
            ->filter(fn (array $source): bool => ($source['score'] ?? 0) > 0 || ($source['alert_level'] ?? null) !== null)
            ->values()
            ->map(function (array $source, int $index): array {
                $level = $this->priorityLevel((int) ($source['score'] ?? 0), $source['alert_level'] ?? null);

                return [
                    'id' => 'priority-'.$this->slug($source['source_hub_id'] ?? $source['source_hub_name'] ?? $index),
                    'rank' => $index + 1,
                    'source_hub_id' => $source['source_hub_id'],
                    'source_relay_hub_id' => $source['source_relay_hub_id'] ?? null,
                    'source_hub_name' => $source['source_hub_name'],
                    'priority_level' => $level,
                    'title' => ucfirst($level).' support review',
                    'summary' => $level === 'critical'
                        ? 'Rescue/access support should be reviewed first.'
                        : 'Review reported support needs and evidence.',
                    'based_on' => $source['based_on'],
                    'recommended_next_steps' => $source['recommended_next_steps'],
                    'evidence_refs' => $source['evidence_refs'],
                ];
            })
            ->all();
    }

    /**
     * @param array<string, mixed> $payload
     * @param array<int, array<string, mixed>> $needs
     * @param array<int, array<string, mixed>> $sources
     * @return array<int, array<string, mixed>>
     */
    private function packages(array $payload, array $needs, array $sources): array
    {
        $concerns = $this->rows(data_get($payload, 'situation.rollup.concern_groups'));
        $cards = [];

        foreach ($concerns as $index => $concern) {
            $label = $this->text($concern['concern'] ?? $concern['label'] ?? $concern['type'] ?? null) ?? 'Other Current Concerns';
            $package = $this->packageForConcern($label);
            $resourceUnits = $this->number($concern['resource_units'] ?? $concern['requested_resource_units'] ?? null);
            $openReports = $this->number($concern['open_reports'] ?? $concern['report_count'] ?? null);
            $areas = $this->listText($concern['areas'] ?? $concern['source_hubs'] ?? $concern['locations'] ?? []);

            $cards[] = [
                'id' => 'package-'.$this->slug($label),
                'title' => $package['title'],
                'trigger_concern_group' => $label,
                'summary' => 'Prepare advisory support options for this concern group.',
                'open_reports' => $openReports,
                'requested_resource_units' => $resourceUnits,
                'affected_areas' => $areas,
                'suggested_resources' => $package['resources'],
                'recommended_actions' => $package['actions'],
                'suggested_downstream_targets' => array_slice(array_values(array_filter($areas)), 0, 5),
                'based_on' => array_values(array_filter([
                    $label.' concern group',
                    $openReports > 0 ? $this->plural($openReports, 'open report') : null,
                    $resourceUnits > 0 ? $this->plural($resourceUnits, 'requested resource unit') : null,
                ])),
                'evidence_refs' => [sprintf('situation.rollup.concern_groups[%d]', $index)],
            ];
        }

        if ($cards === [] && $needs !== []) {
            foreach (array_slice($needs, 0, 3) as $need) {
                $package = $this->packageForConcern($need['category']);
                $cards[] = [
                    'id' => 'package-'.$this->slug($need['category']),
                    'title' => $package['title'],
                    'trigger_concern_group' => $need['category'],
                    'summary' => 'Requested resource demand suggests this support package for leadership review.',
                    'requested_resource_units' => $need['requested'],
                    'affected_areas' => [],
                    'suggested_resources' => $package['resources'],
                    'recommended_actions' => $package['actions'],
                    'suggested_downstream_targets' => array_slice(array_column($sources, 'source_hub_name'), 0, 5),
                    'based_on' => [
                        $need['category'].' requested demand',
                        $this->plural($need['requested'], 'requested resource unit'),
                    ],
                    'evidence_refs' => $need['evidence_refs'],
                ];
            }
        }

        return $cards;
    }

    /**
     * @param array<int, array<string, mixed>> $sources
     * @param array<int, array<string, mixed>> $needs
     * @param array<int, array<string, mixed>> $routeGaps
     * @return array<int, array<string, mixed>>
     */
    private function decisions(array $sources, array $needs, array $routeGaps): array
    {
        $decisions = [];
        $critical = collect($sources)
            ->sortByDesc('score')
            ->first(fn (array $source): bool => in_array(strtolower((string) ($source['alert_level'] ?? '')), ['critical', 'elevated'], true));

        if (is_array($critical)) {
            $decisions[] = [
                'id' => 'decision-review-'.$this->slug($critical['source_hub_id']),
                'title' => 'Review support augmentation for '.$critical['source_hub_name'],
                'status' => 'draft_advisory',
                'summary' => 'Leadership approval is required before support is committed.',
                'suggested_action' => 'Review rescue, access, and resource support options before issuing commitments.',
                'source_hub_id' => $critical['source_hub_id'],
                'source_relay_hub_id' => $critical['source_relay_hub_id'] ?? null,
                'based_on' => array_slice($critical['based_on'], 0, 5),
                'evidence_refs' => $critical['evidence_refs'],
            ];
        }

        $heavy = collect($needs)->first(fn (array $need): bool => str_contains(strtolower($need['category']), 'heavy') || str_contains(strtolower($need['category']), 'clearing') || str_contains(strtolower($need['category']), 'engineering'));
        if (is_array($heavy)) {
            $decisions[] = [
                'id' => 'decision-heavy-equipment',
                'title' => 'Check engineering or heavy equipment support',
                'status' => 'draft_advisory',
                'summary' => 'Requested demand is a signal only; available supply is not confirmed.',
                'suggested_action' => 'Check city engineering availability and escalate if local supply is insufficient.',
                'based_on' => [
                    $heavy['category'].' demand',
                    $this->plural($heavy['requested'], 'requested resource unit'),
                ],
                'evidence_refs' => $heavy['evidence_refs'],
            ];
        }

        if ($routeGaps !== []) {
            $decisions[] = [
                'id' => 'decision-route-verification',
                'title' => 'Verify route constraints before public advisory',
                'status' => 'draft_advisory',
                'summary' => 'Route/access reports require field verification before guidance is issued.',
                'suggested_action' => 'Ask affected source hubs to confirm passability and alternate access.',
                'based_on' => array_values(array_unique(array_column($routeGaps, 'reason'))),
                'evidence_refs' => array_values(array_unique(collect($routeGaps)->flatMap(fn (array $gap): array => $gap['evidence_refs'])->all())),
            ];
        }

        return $decisions;
    }

    /**
     * @param array<int, array<string, mixed>> $needs
     * @return array<int, array<string, mixed>>
     */
    private function matching(array $needs): array
    {
        return array_map(fn (array $need): array => [
            'id' => 'matching-'.$this->slug($need['category']),
            'demand_category' => $need['category'],
            'requested' => $need['requested'],
            'availability_status' => 'availability unknown',
            'available' => null,
            'gap' => null,
            'suggested_action' => 'Verify available resources before committing support.',
            'based_on' => [
                $need['category'].' requested demand',
                $this->plural($need['requested'], 'requested resource unit'),
            ],
            'evidence_refs' => $need['evidence_refs'],
        ], $needs);
    }

    /**
     * @param array<int, array<string, mixed>> $routeGaps
     * @param array<int, array<string, mixed>> $populationNotes
     * @param array<int, array<string, mixed>> $needs
     * @param array<int, array<string, mixed>> $sources
     * @return array<int, array<string, mixed>>
     */
    private function clarifications(array $routeGaps, array $populationNotes, array $needs, array $sources): array
    {
        $cards = [];

        foreach ($routeGaps as $index => $gap) {
            $cards[] = [
                'id' => 'clarify-route-'.$index,
                'type' => 'route_access_verification',
                'target' => $gap['target'],
                'question' => 'Confirm current route passability and alternate access for emergency vehicles.',
                'reason' => $gap['reason'],
                'suggested_response_options' => [
                    'Fully blocked',
                    'Passable to emergency vehicles only',
                    'Limited or one lane only',
                    'Cleared',
                    'Unknown or needs field verification',
                ],
                'based_on' => [$gap['reason']],
                'evidence_refs' => $gap['evidence_refs'],
            ];
        }

        foreach ($populationNotes as $index => $note) {
            $cards[] = [
                'id' => 'clarify-population-'.$index,
                'type' => 'population_count_verification',
                'target' => 'All source hubs',
                'question' => 'Confirm whether people-at-risk counts overlap with evacuation, patient, or affected-family records.',
                'reason' => $note['note'],
                'based_on' => [$note['note']],
                'evidence_refs' => [$note['evidence_ref']],
            ];
        }

        if ($needs !== []) {
            $total = array_sum(array_column($needs, 'requested'));
            $cards[] = [
                'id' => 'clarify-resource-supply',
                'type' => 'resource_supply_uncertainty',
                'target' => 'All source hubs',
                'question' => 'Which requested resource units remain unmet and still need upstream support?',
                'reason' => 'SITREP reports requested resource demand, but resource supply is not confirmed.',
                'based_on' => [
                    $this->plural($total, 'requested resource unit'),
                    'No resource availability registry is connected',
                ],
                'evidence_refs' => array_values(array_unique(collect($needs)->flatMap(fn (array $need): array => $need['evidence_refs'])->all())),
            ];
        }

        foreach ($sources as $source) {
            if (($source['snapshot_at'] ?? null) === null) {
                $cards[] = [
                    'id' => 'clarify-freshness-'.$this->slug($source['source_hub_id']),
                    'type' => 'source_freshness_verification',
                    'target' => $source['source_hub_name'],
                    'source_hub_id' => $source['source_hub_id'],
                    'question' => 'Confirm whether the latest source SITREP is still current.',
                    'reason' => 'Source freshness timestamp is unavailable in the consolidated payload.',
                    'based_on' => ['Missing source snapshot timestamp'],
                    'evidence_refs' => $source['evidence_refs'],
                ];
            }
        }

        return $cards;
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<int, array<string, mixed>>
     */
    private function needRows(array $payload): array
    {
        $sourcePath = 'needs.rollup.category_demand';
        $rows = $this->rows(data_get($payload, $sourcePath));

        if ($rows === []) {
            $sourcePath = 'needs.rollup.category_groups';
            $rows = $this->rows(data_get($payload, $sourcePath));
        }

        if ($rows === []) {
            $sourcePath = 'needs.rollup.resource_groups';
            $rows = $this->rows(data_get($payload, $sourcePath));
        }

        if ($rows === []) {
            $sourcePath = 'needs.rollup.items';
            $rows = $this->rows(data_get($payload, $sourcePath));
        }

        return collect($rows)
            ->map(function (array $row, int $index) use ($sourcePath): ?array {
                $category = $this->text($row['category'] ?? $row['resource_category'] ?? $row['resource'] ?? $row['label'] ?? null);
                $requested = $this->number($row['quantity_requested'] ?? $row['quantity'] ?? $row['requested'] ?? $row['resource_units'] ?? null);

                if ($category === null || $requested <= 0) {
                    return null;
                }

                return [
                    'category' => $category,
                    'requested' => $requested,
                    'location_count' => $this->number($row['location_count'] ?? null),
                    'evidence_refs' => [sprintf('%s[%d]', $sourcePath, $index)],
                ];
            })
            ->filter()
            ->values()
            ->all();
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<int, array<string, mixed>>
     */
    private function routeGaps(array $payload): array
    {
        $rows = $this->rows(data_get($payload, 'gaps.rollup.items'));
        $gaps = [];

        foreach ($rows as $index => $row) {
            $haystack = strtolower(json_encode($row, JSON_PARTIAL_OUTPUT_ON_ERROR) ?: '');

            if (! str_contains($haystack, 'route') && ! str_contains($haystack, 'access') && ! str_contains($haystack, 'blocked') && ! str_contains($haystack, 'passable')) {
                continue;
            }

            $gaps[] = [
                'target' => $this->text($row['target'] ?? $row['location'] ?? $row['source_hub'] ?? null) ?? 'Affected source hubs',
                'reason' => $this->text($row['decision_relevance'] ?? $row['body'] ?? $row['summary'] ?? $row['title'] ?? null)
                    ?? 'SITREP includes route or access constraints.',
                'evidence_refs' => [sprintf('gaps.rollup.items[%d]', $index)],
            ];
        }

        return $gaps;
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<int, array{note: string, evidence_ref: string}>
     */
    private function populationNotes(array $payload): array
    {
        $notes = [];

        foreach (['numeric_total_note', 'confidence_note'] as $key) {
            $note = $this->text(data_get($payload, 'population.rollup.'.$key));
            if ($note !== null) {
                $notes[] = [
                    'note' => $note,
                    'evidence_ref' => 'population.rollup.'.$key,
                ];
            }
        }

        return $notes;
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, string>
     */
    private function sourceAlertLevels(array $payload): array
    {
        $alerts = [];
        $sourceSitreps = data_get($payload, 'source_snapshot.rollup.source_sitreps');

        if (is_array($sourceSitreps)) {
            foreach ($sourceSitreps as $sourceSitrep) {
                if (! is_array($sourceSitrep)) {
                    continue;
                }

                $ids = array_values(array_unique(array_filter([
                    $this->text($sourceSitrep['source_hub_id'] ?? null),
                    $this->text($sourceSitrep['hub_id'] ?? null),
                    $this->text($sourceSitrep['source_relay_hub_id'] ?? null),
                    $this->text($sourceSitrep['relay_hub_id'] ?? null),
                ])));
                $alert = $this->text($sourceSitrep['alert_level'] ?? null);

                if ($alert === null) {
                    continue;
                }

                foreach ($ids as $id) {
                    $alerts[$id] = $alert;
                }
            }
        }

        return $alerts;
    }

    /**
     * @param array<string, array<string, mixed>> $profiles
     * @param array<string, mixed> $item
     */
    private function profileForItem(array $profiles, array $item): ?string
    {
        $location = is_array($item['location'] ?? null) ? $item['location'] : [];
        $candidateIds = [
            $location['id'] ?? null,
            $location['hub_id'] ?? null,
            $location['relay_hub_id'] ?? null,
            $location['source_relay_hub_id'] ?? null,
            data_get($item, 'data.hub_node.snapshot.hub_id'),
            data_get($item, 'data.hub_node.snapshot.relay_hub_id'),
            data_get($item, 'data.source_snapshot.hub_node.snapshot.hub_id'),
            data_get($item, 'data.source_snapshot.hub_node.snapshot.relay_hub_id'),
        ];

        foreach ($candidateIds as $candidate) {
            $id = $this->text($candidate);
            if ($id === null) {
                continue;
            }

            if (isset($profiles[$id])) {
                return $id;
            }

            foreach ($profiles as $profileId => $profile) {
                if (in_array($id, $profile['aliases'] ?? [], true)) {
                    return $profileId;
                }
            }
        }

        return null;
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<int, array<string, mixed>>
     */
    private function sectionItems(array $payload, string $section): array
    {
        return $this->rows(data_get($payload, $section.'.items'));
    }

    /**
     * @param mixed $value
     * @return array<int, array<string, mixed>>
     */
    private function rows(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        return array_values(array_filter($value, 'is_array'));
    }

    /**
     * @param array<string, string> $alerts
     * @param array<int, string> $aliases
     */
    private function firstAlert(array $alerts, array $aliases): ?string
    {
        foreach ($aliases as $alias) {
            if (isset($alerts[$alias])) {
                return $alerts[$alias];
            }
        }

        return null;
    }

    private function priorityLevel(int $score, mixed $alertLevel): string
    {
        $alert = strtolower((string) $alertLevel);

        if ($alert === 'critical' || $score >= 70) {
            return 'critical';
        }

        if ($alert === 'elevated' || $score >= 35) {
            return 'high';
        }

        return 'watch';
    }

    /**
     * @return array{title: string, resources: array<int, string>, actions: array<int, string>}
     */
    private function packageForConcern(string $concern): array
    {
        $value = strtolower($concern);

        if (str_contains($value, 'flood') || str_contains($value, 'rescue') || str_contains($value, 'evac')) {
            return [
                'title' => 'Rescue / Evacuation Support',
                'resources' => ['Rescue teams', 'Evacuation transport', 'Life vests', 'Welfare team'],
                'actions' => ['Prepare rescue augmentation', 'Confirm evacuation needs', 'Check route passability'],
            ];
        }

        if (str_contains($value, 'infrastructure') || str_contains($value, 'access') || str_contains($value, 'utility') || str_contains($value, 'clearing') || str_contains($value, 'engineering')) {
            return [
                'title' => 'Engineering / Access Clearing',
                'resources' => ['Engineering team', 'Heavy equipment', 'Utility repair team', 'Access verification team'],
                'actions' => ['Check engineering availability', 'Verify blocked routes', 'Coordinate utility support'],
            ];
        }

        if (str_contains($value, 'fire') || str_contains($value, 'shelter')) {
            return [
                'title' => 'Fire / Shelter Support',
                'resources' => ['Fire truck', 'Structural assessment', 'Tents', 'Family kits'],
                'actions' => ['Coordinate fire response', 'Assess shelter damage', 'Prepare temporary shelter support'],
            ];
        }

        if (str_contains($value, 'safety') || str_contains($value, 'protection') || str_contains($value, 'traffic')) {
            return [
                'title' => 'Public Safety Support',
                'resources' => ['Police unit', 'Traffic control', 'Perimeter barriers', 'Crowd control'],
                'actions' => ['Coordinate public safety support', 'Review traffic control needs', 'Prepare perimeter guidance'],
            ];
        }

        return [
            'title' => 'Mixed Emergency Support',
            'resources' => ['EMS support', 'Specialized responders', 'Assessment team'],
            'actions' => ['Review source evidence', 'Confirm unmet needs', 'Prepare advisory support options'],
        ];
    }

    /**
     * @return array<int, string>
     */
    private function listText(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        return array_values(array_filter(array_map(fn (mixed $item): ?string => $this->text($item), $value)));
    }

    private function text(mixed $value): ?string
    {
        if (! is_scalar($value)) {
            return null;
        }

        $value = trim((string) $value);

        return $value !== '' ? $value : null;
    }

    private function number(mixed $value): int
    {
        return is_numeric($value) ? max(0, (int) $value) : 0;
    }

    private function plural(int $count, string $singular, ?string $plural = null): string
    {
        return $count.' '.($count === 1 ? $singular : ($plural ?? $singular.'s'));
    }

    private function slug(mixed $value): string
    {
        return Str::slug((string) $value) ?: 'item';
    }
}
