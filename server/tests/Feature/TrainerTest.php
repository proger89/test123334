<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Game\AttemptResult;
use App\Game\AttemptService;
use App\Game\AttemptState;
use App\Game\Progress;
use App\Game\ScenarioCatalog;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class TrainerTest extends TestCase
{
    use DatabaseTransactions;

    private string $profile;

    protected function setUp(): void
    {
        parent::setUp();
        if (config('database.connections.pgsql.database') !== 'vsm_test') {
            throw new \RuntimeException('Tests require isolated vsm_test database');
        }$this->profile = (string) Str::uuid();
        DB::table('profiles')->insert(['id' => $this->profile, 'name' => 'Тест', 'brigade' => 'Бригада №12', 'depot' => 'Москва', 'created_at' => now(), 'updated_at' => now()]);
    }

    private function start(string $scenario = 'security', string $mode = 'check'): array
    {
        return app(AttemptService::class)->create($this->profile, $scenario, $mode, true);
    }

    private function act(array $a, string $action, string $thread = 'security', ?string $key = null): array
    {
        return app(AttemptService::class)->command($this->profile, $a['id'], 'actions', ['request_id' => $key ?? (string) Str::uuid(), 'expected_revision' => $a['revision'], 'thread_id' => $thread, 'action_id' => $action]);
    }

    private function complete(string $scenario = 'security', string $mode = 'check'): array
    {
        $a = $this->start($scenario, $mode);
        if ($scenario === 'security') {
            foreach (['warn', 'notify', 'complete'] as $action) {
                [$code,$a] = $this->act($a, $action);
                self::assertSame(200, $code);
            }
        } else {
            foreach (['apologize', 'check', 'offer', 'report', 'return'] as $action) {
                [$code,$a] = $this->act($a, $action, 'service');
                self::assertSame(200, $code);
            }$row = DB::table('attempts')->where('id', $a['id'])->first();
            $s = AttemptState::restore($row->state);
            $s->eventAt = microtime(true) - 1;
            DB::table('attempts')->where('id', $a['id'])->update(['state' => $s->json()]);
            $a = app(AttemptService::class)->load($this->profile, $a['id']);
            foreach (['owner', 'polite'] as $action) {
                [$code,$a] = $this->act($a, $action, 'baggage');
                self::assertSame(200, $code);
            }
        }

        return $a;
    }

    public function test_exact_duplicate_returns_identical_response_and_no_second_effect(): void
    {
        $a = $this->start();
        $key = (string) Str::uuid();
        $one = $this->act($a, 'warn', key: $key);
        $two = $this->act($a, 'warn', key: $key);
        self::assertSame($one, $two);
        self::assertSame(65, $two[1]['loyalty']);
        self::assertSame(409, $this->act($a, 'move', key: $key)[0]);
    }

    public function test_timeout_persists_when_command_rejected(): void
    {
        $a = $this->start();
        $s = AttemptState::restore(DB::table('attempts')->where('id', $a['id'])->value('state'));
        $s->deadline = microtime(true) - 1;
        DB::table('attempts')->where('id', $a['id'])->update(['state' => $s->json()]);
        [$status,$body] = $this->act($a, 'warn');
        self::assertSame(409, $status);
        self::assertSame('completed', $body['state']['status']);
        self::assertTrue($body['state']['result']['critical']);
        self::assertNotNull(DB::table('attempts')->where('id', $a['id'])->value('finished_at'));
    }

    public function test_training_never_awards_ranking_points(): void
    {
        $this->complete(mode: 'train');
        self::assertSame(0, app(Progress::class)->summary($this->profile)['total']);
    }

    public function test_repeated_check_does_not_farm_points(): void
    {
        $this->complete();
        $this->complete();
        self::assertSame(100, app(Progress::class)->summary($this->profile)['permanent']);
        self::assertSame(1, DB::table('awards')->where('profile_id', $this->profile)->where('code', 'security')->count());
    }

    public function test_challenge_counts_only_checks_after_join(): void
    {
        $this->complete();
        DB::table('challenge_entries')->insert(['profile_id' => $this->profile, 'joined_at' => DB::raw('clock_timestamp()'), 'expires_at' => now()->addDay()]);
        $this->complete('service');
        self::assertSame(0, DB::table('bonuses')->where('profile_id', $this->profile)->count());
        $this->complete(mode: 'train');
        self::assertSame(0, DB::table('bonuses')->where('profile_id', $this->profile)->count());
        $this->complete();
        self::assertSame(20, app(Progress::class)->summary($this->profile)['bonus']);
        $this->complete();
        self::assertSame(1, DB::table('bonuses')->where('profile_id', $this->profile)->count());
    }

    public function test_bonus_expiration_does_not_depend_on_worker(): void
    {
        DB::table('bonuses')->insert(['profile_id' => $this->profile, 'source' => 'test', 'points' => 20, 'expires_at' => now()->subSecond()]);
        self::assertSame(0, app(Progress::class)->summary($this->profile)['bonus']);
    }

    public function test_one_open_attempt_per_profile(): void
    {
        $one = $this->start();
        $two = $this->start('service');
        self::assertSame($one['id'], $two['id']);
    }

    public function test_other_profile_cannot_access_attempt(): void
    {
        $a = $this->start();
        $this->withSession(['profile_id' => '00000000-0000-4000-8000-000000000001'])->getJson('/api/v1/attempts/'.$a['id'])->assertNotFound();
    }

    public function test_pause_preserves_hidden_event_and_is_idempotent(): void
    {
        $a = $this->start('service', 'train');
        [, $a] = $this->act($a, 'apologize', 'service');
        $args = ['request_id' => (string) Str::uuid(), 'expected_revision' => $a['revision'], 'paused' => true];
        [$code,$paused] = app(AttemptService::class)->command($this->profile, $a['id'], 'pause', $args);
        self::assertSame(200, $code);
        self::assertSame('paused', $paused['status']);
        $args['request_id'] = (string) Str::uuid();
        $args['expected_revision'] = $paused['revision'];
        [, $same] = app(AttemptService::class)->command($this->profile, $a['id'], 'pause', $args);
        self::assertSame($paused['revision'], $same['revision']);
        $s = AttemptState::restore(DB::table('attempts')->where('id', $a['id'])->value('state'));
        self::assertNull($s->eventAt);
        self::assertGreaterThan(0, $s->eventRemaining);
    }

    public function test_published_versions_are_immutable(): void
    {
        $json = DB::table('scenario_versions')->where('scenario', 'security')->value('definition');
        $data = json_decode($json, true);
        $data['title'] = 'Другой заголовок';
        $this->expectException(\DomainException::class);
        app(ScenarioCatalog::class)->publish(json_encode($data));
    }

    public function test_export_requires_scoped_token(): void
    {
        $this->getJson('/api/v1/integrations/results')->assertUnauthorized();
        $token = Str::random(40);
        DB::table('integration_tokens')->insert(['hash' => hash('sha256', $token), 'scope' => 'results:read', 'expires_at' => now()->addHour()]);
        $this->withToken($token)->getJson('/api/v1/integrations/results')->assertOk()->assertJsonStructure(['data', 'next_cursor']);
    }

    public function test_new_version_preserves_existing_attempt_and_ranked_version(): void
    {
        $old = $this->start('service', 'train');
        $data = json_decode(DB::table('scenario_versions')->where('scenario', 'service')->where('version', '1')->value('definition'), true);
        $data['version'] = '2';
        $data['intro'] = 'Новая учебная редакция';
        app(ScenarioCatalog::class)->publish(json_encode($data));
        self::assertSame('1', app(AttemptService::class)->load($this->profile, $old['id'])['version']);
        self::assertSame('2', app(ScenarioCatalog::class)->get('service')->version);
        self::assertSame('1', app(ScenarioCatalog::class)->get('service', ranked: true)->version);
        self::assertSame(0, app(Progress::class)->summary($this->profile)['permanent']);
    }

    public function test_best_scores_increase_only_by_difference(): void
    {
        $state = app(ScenarioCatalog::class)->get('service')->initialState('check', true, 100);
        foreach ([78 => 78, 89 => 89] as $score => $expected) {
            $result = new AttemptResult($score, true, false, [], [], [], []);
            app(Progress::class)->record($this->profile, $state, $result);
            app(Progress::class)->record($this->profile, $state, $result);
            self::assertSame($expected, app(Progress::class)->summary($this->profile)['permanent']);
        }
    }

    public function test_competencies_keep_last_five_of_each_group_beyond_history_limit(): void
    {
        $this->complete('service', 'train');
        $last = $this->complete('security', 'check');
        $row = (array) DB::table('attempts')->where('id', $last['id'])->first();
        for ($i = 0; $i < 101; $i++) {
            $row['id'] = (string) Str::uuid();
            DB::table('attempts')->insert($row);
        }
        $summary = app(Progress::class)->summary($this->profile);
        self::assertCount(100, $summary['history']);
        self::assertNotEmpty(array_filter($summary['competencies'], fn (array $c): bool => $c['scenario'] === 'service'));
        foreach ($summary['competencies'] as $competency) {
            self::assertLessThanOrEqual(5, $competency['attempts']);
        }
    }

    public function test_challenge_uses_completion_time_not_later_award_processing_time(): void
    {
        $this->complete('service');
        $this->complete('security');
        DB::table('attempts')->where('profile_id', $this->profile)->update(['finished_at' => now()->subSeconds(2)]);
        DB::table('challenge_entries')->insert(['profile_id' => $this->profile, 'joined_at' => now()->subHour(), 'expires_at' => now()->subSecond()]);
        $state = app(ScenarioCatalog::class)->get('security')->initialState('check', true, 100);
        app(Progress::class)->record($this->profile, $state, new AttemptResult(100, true, false, [], [], [], []));
        self::assertSame(20, app(Progress::class)->summary($this->profile)['bonus']);
    }
}
