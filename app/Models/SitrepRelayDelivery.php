<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SitrepRelayDelivery extends Model
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_SENT = 'sent';
    public const STATUS_FAILED = 'failed';
    public const STATUS_SUPERSEDED = 'superseded';

    protected $fillable = [
        'consolidated_sitrep_id',
        'status',
        'relay_id',
        'relay_message_id',
        'deliveries_count',
        'attempt_count',
        'last_attempted_at',
        'submitted_at',
        'last_error',
        'response_json',
    ];

    protected $casts = [
        'deliveries_count' => 'integer',
        'attempt_count' => 'integer',
        'last_attempted_at' => 'datetime',
        'submitted_at' => 'datetime',
        'response_json' => 'array',
    ];

    public function consolidatedSitrep(): BelongsTo
    {
        return $this->belongsTo(ConsolidatedSitrep::class);
    }
}
