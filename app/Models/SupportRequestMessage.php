<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupportRequestMessage extends Model
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_ACCEPTED = 'accepted';
    public const STATUS_DUPLICATE = 'duplicate';
    public const STATUS_INVALID = 'invalid';

    protected $fillable = [
        'support_request_id',
        'relay_id',
        'relay_message_id',
        'message_type',
        'source_system',
        'target_system',
        'direction',
        'validation_status',
        'raw_envelope',
        'payload',
        'validation_errors',
        'processed_at',
    ];

    protected $casts = [
        'raw_envelope' => 'array',
        'payload' => 'array',
        'validation_errors' => 'array',
        'processed_at' => 'datetime',
    ];

    public function supportRequest(): BelongsTo
    {
        return $this->belongsTo(SupportRequest::class);
    }
}
