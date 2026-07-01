<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('account_admin_audit_events', function (Blueprint $table): void {
            $table->id();
            $table->string('action', 80);
            $table->string('pbb_user_id')->nullable()->index();
            $table->foreignId('local_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('account_client', 120)->nullable();
            $table->text('reason')->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('account_admin_audit_events');
    }
};
