<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupportRequestUpdateDelivery extends Model
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_SENT = 'sent';
    public const STATUS_FAILED = 'failed';

    protected $fillable = [
        'support_request_id',
        'update_id',
        'message_type',
        'source_system',
        'target_system',
        'status',
        'delivery_status',
        'relay_id',
        'relay_message_id',
        'deliveries_count',
        'attempt_count',
        'last_attempted_at',
        'submitted_at',
        'last_error',
        'envelope',
        'response_json',
    ];

    protected $casts = [
        'deliveries_count' => 'integer',
        'attempt_count' => 'integer',
        'last_attempted_at' => 'datetime',
        'submitted_at' => 'datetime',
        'envelope' => 'array',
        'response_json' => 'array',
    ];

    public function supportRequest(): BelongsTo
    {
        return $this->belongsTo(SupportRequest::class);
    }
}
