<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AccountAdminAuditEvent extends Model
{
    protected $fillable = [
        'action',
        'pbb_user_id',
        'local_user_id',
        'account_client',
        'reason',
        'payload',
    ];

    protected $casts = [
        'payload' => 'array',
    ];
}
