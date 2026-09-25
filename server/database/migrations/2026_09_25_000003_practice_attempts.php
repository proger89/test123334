<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attempts', function (Blueprint $table) {
            $table->string('practice_id')->nullable();
            $table->foreignUuid('source_attempt_id')->nullable()->constrained('attempts');
        });
    }

    public function down(): void
    {
        throw new LogicException('Сохраните упражнения и их связи. Для отката используйте совместимую версию приложения.');
    }
};
