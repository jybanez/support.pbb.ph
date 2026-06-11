<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('support_request_update_deliveries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('support_request_id')->constrained('support_requests')->cascadeOnDelete();
            $table->string('update_id')->unique();
            $table->string('message_type')->index();
            $table->string('source_system')->index();
            $table->string('target_system')->index();
            $table->string('status')->index();
            $table->string('delivery_status')->default('pending')->index();
            $table->string('relay_id')->nullable()->index();
            $table->string('relay_message_id')->nullable();
            $table->unsignedInteger('deliveries_count')->nullable();
            $table->unsignedInteger('attempt_count')->default(0);
            $table->timestamp('last_attempted_at')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->text('last_error')->nullable();
            $table->json('envelope');
            $table->json('response_json')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_request_update_deliveries');
    }
};
