<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SupportRequest extends Model
{
    protected $fillable = [
        'support_request_id',
        'local_request_id',
        'correlation_id',
        'relay_message_id',
        'source_system',
        'source_hub_id',
        'source_relay_hub_id',
        'source_hub_name',
        'status',
        'urgency',
        'requested_assistance',
        'requested_capability',
        'quantity',
        'quantity_unit',
        'staging_notes',
        'command_notes',
        'requested_at',
        'requester_user_id',
        'requester_display_name',
        'requester_role',
        'sitrep_context',
        'gap_context',
        'evidence_row',
        'incident_refs',
        'request_payload',
        'raw_envelope',
        'intake_received_at',
        'received_at',
        'received_by_user_id',
    ];

    protected $casts = [
        'quantity' => 'decimal:2',
        'requested_at' => 'datetime',
        'sitrep_context' => 'array',
        'gap_context' => 'array',
        'evidence_row' => 'array',
        'incident_refs' => 'array',
        'request_payload' => 'array',
        'raw_envelope' => 'array',
        'intake_received_at' => 'datetime',
        'received_at' => 'datetime',
    ];

    public function messages(): HasMany
    {
        return $this->hasMany(SupportRequestMessage::class);
    }

    public function updateDeliveries(): HasMany
    {
        return $this->hasMany(SupportRequestUpdateDelivery::class);
    }

    public function actions(): HasMany
    {
        return $this->hasMany(SupportRequestAction::class);
    }
}
