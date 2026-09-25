<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('scenario_drafts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('profile_id')->constrained('profiles');
            $table->string('scenario');
            $table->string('base_version');
            $table->text('definition');
            $table->unsignedInteger('revision')->default(0);
            $table->string('published_version')->nullable();
            $table->timestamps();
        });
        Schema::create('editor_previews', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('profile_id')->unique()->constrained('profiles');
            $table->text('definition');
            $table->text('state');
        });
    }

    public function down(): void
    {
        throw new LogicException('Сохраните черновики и пробные прохождения при возврате предыдущей версии приложения.');
    }
};
