<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('relay_inbound_sitreps', function (Blueprint $table): void {
            $table->id();
            $table->string('relay_id')->nullable()->index();
            $table->string('relay_message_id')->nullable();
            $table->string('source_hub_id')->nullable()->index();
            $table->string('source_system')->nullable()->index();
            $table->string('message_type')->nullable()->index();
            $table->string('priority')->nullable();
            $table->timestamp('occurred_at')->nullable();
            $table->timestamp('received_at')->nullable();
            $table->string('validation_status')->default('pending')->index();
            $table->json('raw_envelope');
            $table->json('sitrep_payload')->nullable();
            $table->json('normalized_sitrep')->nullable();
            $table->json('validation_issues')->nullable();
            $table->timestamp('staged_at')->nullable();
            $table->timestamps();
        });

        Schema::create('sitrep_stagings', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('relay_inbound_sitrep_id')->nullable()->constrained('relay_inbound_sitreps')->nullOnDelete();
            $table->string('source_deployment')->index();
            $table->string('source_hub_id')->unique();
            $table->string('source_hub_name')->nullable();
            $table->string('relay_hub_id')->nullable()->index();
            $table->string('alert_level')->default('Normal')->index();
            $table->string('payload_hash', 64)->index();
            $table->timestamp('period_started_at')->nullable();
            $table->timestamp('period_ended_at')->nullable();
            $table->timestamp('generated_at')->nullable();
            $table->json('normalized_sitrep');
            $table->json('sitrep_payload');
            $table->timestamp('staged_at')->useCurrent();
            $table->timestamps();
        });

        Schema::create('consolidated_sitreps', function (Blueprint $table): void {
            $table->id();
            $table->string('status')->default('current')->index();
            $table->string('alert_level')->default('Normal')->index();
            $table->string('computed_source_alert_level')->default('Normal')->index();
            $table->unsignedInteger('source_sitrep_count')->default(0);
            $table->json('sitrep_payload')->nullable();
            $table->json('source_index')->nullable();
            $table->json('validation_issues')->nullable();
            $table->timestamp('consolidated_at')->nullable();
            $table->timestamps();
        });

        Schema::create('sitrep_relay_deliveries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('consolidated_sitrep_id')->constrained('consolidated_sitreps')->cascadeOnDelete();
            $table->string('status')->default('pending')->index();
            $table->string('relay_id')->nullable()->index();
            $table->string('relay_message_id')->nullable();
            $table->unsignedInteger('deliveries_count')->nullable();
            $table->unsignedInteger('attempt_count')->default(0);
            $table->timestamp('last_attempted_at')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->text('last_error')->nullable();
            $table->json('response_json')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sitrep_relay_deliveries');
        Schema::dropIfExists('consolidated_sitreps');
        Schema::dropIfExists('sitrep_stagings');
        Schema::dropIfExists('relay_inbound_sitreps');
    }
};
