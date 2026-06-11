<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('support_requests', function (Blueprint $table): void {
            $table->timestamp('received_at')->nullable()->after('intake_received_at');
            $table->foreignId('received_by_user_id')->nullable()->after('received_at')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('support_requests', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('received_by_user_id');
            $table->dropColumn('received_at');
        });
    }
};
