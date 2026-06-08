<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasOne;

class RelayInboundSitrep extends Model
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_VALID = 'valid';
    public const STATUS_INVALID = 'invalid';
    public const STATUS_STAGED = 'staged';

    protected $fillable = [
        'relay_id',
        'relay_message_id',
        'source_hub_id',
        'source_system',
        'message_type',
        'priority',
        'occurred_at',
        'received_at',
        'validation_status',
        'raw_envelope',
        'sitrep_payload',
        'normalized_sitrep',
        'validation_issues',
        'staged_at',
    ];

    protected $casts = [
        'occurred_at' => 'datetime',
        'received_at' => 'datetime',
        'raw_envelope' => 'array',
        'sitrep_payload' => 'array',
        'normalized_sitrep' => 'array',
        'validation_issues' => 'array',
        'staged_at' => 'datetime',
    ];

    public function staging(): HasOne
    {
        return $this->hasOne(SitrepStaging::class);
    }
}
