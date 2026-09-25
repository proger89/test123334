<?php

declare(strict_types=1);
use App\Game\AttemptService;
use App\Game\ScenarioCatalog;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

Artisan::command('vsm:seed', function () {
    DB::transaction(function () {
        DB::select('select pg_advisory_xact_lock(742619)');
        foreach (glob(env('CONTENT_PATH', base_path('../content')).'/*.json') as $file) {
            $json = file_get_contents($file);
            $definition = json_decode($json, true, flags: JSON_THROW_ON_ERROR);
            $ranked = in_array($definition['id'], ['service', 'security'], true) && $definition['version'] === '1';
            app(ScenarioCatalog::class)->publish($json, $ranked);
        }
        foreach ([['12', 'Москва', 70], ['13', 'Москва', 90], ['21', 'Санкт-Петербург', 95]] as $i => $seed) {
            $id = '00000000-0000-4000-8000-'.str_pad((string) ($i + 1), 12, '0', STR_PAD_LEFT);
            DB::table('profiles')->insertOrIgnore(['id' => $id, 'name' => 'Демо-проводник '.($i + 1), 'brigade' => 'Бригада №'.$seed[0], 'depot' => $seed[1], 'demo' => true, 'created_at' => now(), 'updated_at' => now()]);
            DB::table('best_results')->insertOrIgnore(['profile_id' => $id, 'scenario' => 'service', 'score' => $seed[2], 'score_set' => 'vsm-hackathon-2026']);
        }
    });
    $this->info('Сценарии и демоданные готовы');
});
Artisan::command('vsm:work', function () {
    while (true) {
        app(AttemptService::class)->tick();
        sleep(1);
    }
});
Artisan::command('vsm:init', function () {
    DB::select('select pg_advisory_lock(742618)');
    try {
        if ($this->call('migrate', ['--force' => true]) !== 0) {
            return 1;
        }

        return $this->call('vsm:seed');
    } finally {
        DB::select('select pg_advisory_unlock(742618)');
    }
});
Artisan::command('vsm:worker-health', function () {
    return DB::table('worker_heartbeats')->where('id', 'main')
        ->where('last_success', '>', now()->subSeconds(15))->exists() ? 0 : 1;
});
Artisan::command('scenario:publish {file}', function () {
    app(ScenarioCatalog::class)->publish(file_get_contents($this->argument('file')));
    $this->info('Версия опубликована для обучения');
});
Artisan::command('demo:bonus-expiry {profile}', function () {
    abort_unless(app()->environment('local'), 403);
    $id = $this->argument('profile');
    abort_unless(DB::table('profiles')->where('id', $id)->exists(), 404);
    DB::table('bonuses')->insert(['profile_id' => $id, 'source' => 'demo:'.Str::uuid(), 'points' => 20, 'expires_at' => now()->addSeconds(90), 'warning_seconds' => 60]);
    $this->info('Демонстрационный бонус действует 90 секунд');
});
Artisan::command('integration:token', function () {
    $token = bin2hex(random_bytes(24));
    DB::table('integration_tokens')->insert(['hash' => hash('sha256', $token), 'scope' => 'results:read', 'expires_at' => now()->addDay()]);
    $this->line($token);
});
