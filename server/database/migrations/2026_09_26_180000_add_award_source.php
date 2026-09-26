<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('awards', function (Blueprint $table) {
            $table->uuid('attempt_id')->nullable();
            $table->foreign('attempt_id')->references('id')->on('attempts')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('awards', function (Blueprint $table) {
            $table->dropForeign(['attempt_id']);
            $table->dropColumn('attempt_id');
        });
    }
};
