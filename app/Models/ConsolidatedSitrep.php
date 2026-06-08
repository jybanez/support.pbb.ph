<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ConsolidatedSitrep extends Model
{
    public const STATUS_CURRENT = 'current';
    public const STATUS_SUPERSEDED = 'superseded';
    public const STATUS_FAILED = 'failed';

    protected $fillable = [
        'status',
        'alert_level',
        'computed_source_alert_level',
        'source_sitrep_count',
        'sitrep_payload',
        'source_index',
        'validation_issues',
        'consolidated_at',
    ];

    protected $casts = [
        'source_sitrep_count' => 'integer',
        'sitrep_payload' => 'array',
        'source_index' => 'array',
        'validation_issues' => 'array',
        'consolidated_at' => 'datetime',
    ];

    public function relayDeliveries(): HasMany
    {
        return $this->hasMany(SitrepRelayDelivery::class);
    }
}
