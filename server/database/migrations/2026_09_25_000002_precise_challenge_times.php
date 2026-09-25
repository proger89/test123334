<?php

declare(strict_types=1);
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['attempts' => ['finished_at'], 'challenge_entries' => ['joined_at', 'expires_at', 'completed_at'], 'bonuses' => ['expires_at']] as $table => $columns) {
            foreach ($columns as $column) {
                DB::statement("ALTER TABLE {$table} ALTER COLUMN {$column} TYPE timestamp(6) with time zone");
            }
        }
    }

    public function down(): void
    {
        // Previous application builds accept microsecond timestamps as well.
        // Keeping precision avoids changing the order of historical challenge results.
        throw new LogicException('Точность времени сохраняется при возврате предыдущей сборки приложения. Обратное округление исторических результатов не поддерживается.');
    }
};
