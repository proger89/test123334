<?php

declare(strict_types=1);
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('profiles', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->string('name');
            $t->string('portrait')->default('conductor_card');
            $t->string('brigade');
            $t->string('depot');
            $t->boolean('demo')->default(false);
            $t->timestamps();
        });
        Schema::create('scenario_versions', function (Blueprint $t) {
            $t->id();
            $t->string('scenario');
            $t->string('version');
            $t->text('definition');
            $t->string('checksum');
            $t->boolean('ranked')->default(false);
            $t->timestamps();
            $t->unique(['scenario', 'version']);
        });
        Schema::create('attempts', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignUuid('profile_id')->constrained('profiles');
            $t->string('scenario');
            $t->string('version');
            $t->string('mode');
            $t->string('status');
            $t->text('state');
            $t->json('result')->nullable();
            $t->timestampTz('finished_at')->nullable();
            $t->timestamps();
            $t->index(['status', 'profile_id']);
        });
        Schema::create('best_results', function (Blueprint $t) {
            $t->id();
            $t->foreignUuid('profile_id')->constrained('profiles');
            $t->string('scenario');
            $t->string('score_set')->default('vsm-hackathon-2026');
            $t->integer('score');
            $t->unique(['profile_id', 'scenario', 'score_set']);
        });
        Schema::create('awards', function (Blueprint $t) {
            $t->id();
            $t->foreignUuid('profile_id')->constrained('profiles');
            $t->string('code');
            $t->string('title');
            $t->timestamps();
            $t->unique(['profile_id', 'code']);
        });
        Schema::create('challenge_entries', function (Blueprint $t) {
            $t->foreignUuid('profile_id')->primary()->constrained('profiles');
            $t->timestampTz('joined_at');
            $t->timestampTz('expires_at');
            $t->timestampTz('completed_at')->nullable();
        });
        Schema::create('bonuses', function (Blueprint $t) {
            $t->id();
            $t->foreignUuid('profile_id')->constrained('profiles');
            $t->string('source');
            $t->integer('points');
            $t->timestampTz('expires_at');
            $t->integer('warning_seconds')->default(3600);
            $t->unique(['profile_id', 'source']);
        });
        Schema::create('notifications', function (Blueprint $t) {
            $t->id();
            $t->foreignUuid('profile_id')->constrained('profiles');
            $t->string('event_key');
            $t->string('title');
            $t->string('target');
            $t->boolean('read')->default(false);
            $t->timestamps();
            $t->unique(['profile_id', 'event_key']);
        });
        Schema::create('processed_requests', function (Blueprint $t) {
            $t->id();
            $t->foreignUuid('profile_id')->constrained('profiles');
            $t->uuid('request_id');
            $t->string('hash');
            $t->integer('status');
            $t->text('response');
            $t->unique(['profile_id', 'request_id']);
        });
        Schema::create('integration_tokens', function (Blueprint $t) {
            $t->id();
            $t->string('hash')->unique();
            $t->string('scope')->default('results:read');
            $t->timestampTz('expires_at');
        });
        Schema::create('worker_heartbeats', function (Blueprint $t) {
            $t->string('id')->primary();
            $t->timestampTz('last_success');
        });
    }

    public function down(): void
    {
        foreach (['worker_heartbeats', 'integration_tokens', 'processed_requests', 'notifications', 'bonuses', 'challenge_entries', 'awards', 'best_results', 'attempts', 'scenario_versions', 'profiles'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
