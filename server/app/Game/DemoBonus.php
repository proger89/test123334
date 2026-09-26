<?php

declare(strict_types=1);

namespace App\Game;

use Illuminate\Support\Facades\DB;

final class DemoBonus
{
    public function create(string $profile): void
    {
        abort_unless(app()->environment('local'), 403);
        DB::transaction(function () use ($profile): void {
            abort_unless(DB::table('profiles')->where('id', $profile)->lockForUpdate()->first(), 404);
            // A permanent key makes retries and simultaneous clicks harmless.
            DB::table('bonuses')->insertOrIgnore([
                'profile_id' => $profile, 'source' => 'demo:expiry', 'points' => 20,
                'expires_at' => DB::raw("clock_timestamp() + interval '90 seconds'"),
                'warning_seconds' => 60,
            ]);
        });
    }
}
