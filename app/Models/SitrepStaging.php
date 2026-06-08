<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SitrepStaging extends Model
{
    protected $fillable = [
        'relay_inbound_sitrep_id',
        'source_deployment',
        'source_hub_id',
        'source_hub_name',
        'relay_hub_id',
        'alert_level',
        'payload_hash',
        'period_started_at',
        'period_ended_at',
        'generated_at',
        'normalized_sitrep',
        'sitrep_payload',
        'staged_at',
    ];

    protected $casts = [
        'period_started_at' => 'datetime',
        'period_ended_at' => 'datetime',
        'generated_at' => 'datetime',
        'normalized_sitrep' => 'array',
        'sitrep_payload' => 'array',
        'staged_at' => 'datetime',
    ];

    public function inboundSitrep(): BelongsTo
    {
        return $this->belongsTo(RelayInboundSitrep::class, 'relay_inbound_sitrep_id');
    }
}
