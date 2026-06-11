<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('support_requests', function (Blueprint $table): void {
            $table->id();
            $table->string('support_request_id')->unique();
            $table->string('local_request_id')->index();
            $table->string('correlation_id')->unique();
            $table->string('relay_message_id')->nullable()->index();
            $table->string('source_system')->index();
            $table->string('source_hub_id')->nullable()->index();
            $table->string('source_relay_hub_id')->nullable()->index();
            $table->string('source_hub_name')->nullable();
            $table->string('status')->default('requested')->index();
            $table->string('urgency')->default('normal')->index();
            $table->string('requested_assistance')->nullable();
            $table->string('requested_capability')->nullable()->index();
            $table->decimal('quantity', 12, 2)->nullable();
            $table->string('quantity_unit')->nullable();
            $table->text('staging_notes')->nullable();
            $table->text('command_notes')->nullable();
            $table->timestamp('requested_at')->nullable();
            $table->string('requester_user_id')->nullable();
            $table->string('requester_display_name')->nullable();
            $table->string('requester_role')->nullable();
            $table->json('sitrep_context')->nullable();
            $table->json('gap_context')->nullable();
            $table->json('evidence_row')->nullable();
            $table->json('incident_refs')->nullable();
            $table->json('request_payload');
            $table->json('raw_envelope');
            $table->timestamp('intake_received_at')->useCurrent();
            $table->timestamps();
        });

        Schema::create('support_request_messages', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('support_request_id')->nullable()->constrained('support_requests')->nullOnDelete();
            $table->string('relay_id')->nullable()->index();
            $table->string('relay_message_id')->nullable()->index();
            $table->string('message_type')->nullable()->index();
            $table->string('source_system')->nullable()->index();
            $table->string('target_system')->nullable()->index();
            $table->string('direction')->default('inbound')->index();
            $table->string('validation_status')->default('pending')->index();
            $table->json('raw_envelope');
            $table->json('payload')->nullable();
            $table->json('validation_errors')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_request_messages');
        Schema::dropIfExists('support_requests');
    }
};
