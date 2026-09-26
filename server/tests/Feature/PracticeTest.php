<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Game\AttemptService;
use App\Game\AttemptState;
use App\Game\Progress;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class PracticeTest extends TestCase
{
    use DatabaseTransactions;

    private string $profile;

    protected function setUp(): void
    {
        parent::setUp();
        self::assertSame('vsm_test', config('database.connections.pgsql.database'));
        $this->profile = (string) Str::uuid();
        DB::table('profiles')->insert(['id' => $this->profile, 'name' => 'Проверка упражнений', 'brigade' => 'Бригада №12', 'depot' => 'Москва']);
        $this->withSession(['profile_id' => $this->profile]);
    }

    private function source(string $scenario = 'security'): array
    {
        $a = app(AttemptService::class)->create($this->profile, $scenario, 'check', true);
        if ($scenario === 'security') {
            return $this->act($a, 'move', 'security');
        }

        return app(AttemptService::class)->command($this->profile, $a['id'], 'finish', ['request_id' => (string) Str::uuid(), 'expected_revision' => $a['revision']])[1];
    }

    private function act(array $attempt, string $action, string $thread = 'practice'): array
    {
        [$status, $next] = app(AttemptService::class)->command($this->profile, $attempt['id'], 'actions', ['request_id' => (string) Str::uuid(), 'expected_revision' => $attempt['revision'], 'thread_id' => $thread, 'action_id' => $action]);
        self::assertSame(200, $status);

        return $next;
    }

    private function exercise(array $source, string $topic): array
    {
        return $this->postJson('/api/v1/attempts/'.$source['id'].'/practice', ['request_id' => (string) Str::uuid(), 'exercise_id' => $topic])->assertOk()->json();
    }

    public function test_recommendation_is_based_on_source_and_does_not_reveal_future_answers(): void
    {
        $source = $this->source();
        $options = $this->getJson('/api/v1/attempts/'.$source['id'])->assertOk()->json('practice_options');
        self::assertSame(['unattended'], array_column($options, 'id'));
        self::assertStringContainsString('Не перемещать вещь', implode(' ', $options[0]['before']));
        $practice = $this->exercise($source, 'unattended');
        self::assertSame('train', $practice['mode']);
        self::assertArrayNotHasKey('definition', $practice['practice']);
        self::assertArrayNotHasKey('checks', $practice);
        self::assertArrayNotHasKey('explanation', $practice['threads'][0]['actions'][0]);
        self::assertSame([], $practice['practice_options']);
        self::assertNotEmpty($practice['practice']['before']);
    }

    public function test_success_preserves_source_score_critical_competency_rewards_and_export(): void
    {
        $source = $this->source();
        $before = app(Progress::class)->summary($this->profile);
        $sourceJson = DB::table('attempts')->where('id', $source['id'])->value('result');
        $a = $this->exercise($source, 'unattended');
        $a = $this->act($a, 'notify');
        $a = $this->act($a, 'warn');
        self::assertTrue($a['result']['passed']);
        self::assertSame($sourceJson, DB::table('attempts')->where('id', $source['id'])->value('result'));
        $after = app(Progress::class)->summary($this->profile);
        foreach (['permanent', 'bonus', 'level', 'competencies'] as $key) {
            self::assertSame($before[$key], $after[$key]);
        }
        self::assertEquals($before['awards'], $after['awards']);
        self::assertCount(1, $after['history']);
        self::assertCount(1, $after['practice_history']);
        self::assertTrue($after['practice_history'][0]['passed']);
        self::assertSame(0, DB::table('bonuses')->where('profile_id', $this->profile)->count());
        DB::table('integration_tokens')->insert(['hash' => hash('sha256', 'practice-test'), 'scope' => 'results:read', 'expires_at' => now()->addHour()]);
        $export = $this->withToken('practice-test')->getJson('/api/v1/integrations/results')->assertOk()->json('data');
        self::assertNotContains($a['id'], array_column($export, 'id'));
    }

    public function test_start_retry_is_exact_and_changed_payload_conflicts_even_after_completion(): void
    {
        $source = $this->source('service');
        $key = (string) Str::uuid();
        $url = '/api/v1/attempts/'.$source['id'].'/practice';
        $body = ['request_id' => $key, 'exercise_id' => 'communication'];
        $first = $this->postJson($url, $body)->assertOk()->json();
        $a = $this->act($first, 'honest');
        $a = $this->act($a, 'follow_up');
        self::assertTrue($a['result']['passed']);
        self::assertSame($first, $this->postJson($url, $body)->assertOk()->json());
        $this->postJson($url, ['request_id' => $key, 'exercise_id' => 'priority'])->assertConflict();
        self::assertSame(1, DB::table('attempts')->where('profile_id', $this->profile)->whereNotNull('practice_id')->count());
    }

    public function test_other_profile_and_unrecommended_topic_are_rejected(): void
    {
        $source = $this->source();
        $this->postJson('/api/v1/attempts/'.$source['id'].'/practice', ['request_id' => (string) Str::uuid(), 'exercise_id' => 'communication'])->assertConflict();
        $other = (string) Str::uuid();
        DB::table('profiles')->insert(['id' => $other, 'name' => 'Другой', 'brigade' => 'Бригада №12', 'depot' => 'Москва']);
        $this->withSession(['profile_id' => $other])->postJson('/api/v1/attempts/'.$source['id'].'/practice', ['request_id' => (string) Str::uuid(), 'exercise_id' => 'unattended'])->assertNotFound();
    }

    public function test_only_one_open_attempt_and_practice_cannot_recommend_itself(): void
    {
        $source = $this->source();
        $a = $this->exercise($source, 'unattended');
        $retryBody = ['request_id' => (string) Str::uuid(), 'exercise_id' => 'unattended'];
        $conflict = $this->postJson('/api/v1/attempts/'.$source['id'].'/practice', $retryBody)
            ->assertConflict()
            ->assertJsonPath('error.code', 'active_attempt')
            ->assertJsonPath('error.active_attempt_id', $a['id'])
            ->json();
        self::assertSame($conflict, $this->postJson('/api/v1/attempts/'.$source['id'].'/practice', $retryBody)->assertConflict()->json());
        self::assertSame($a['id'], app(AttemptService::class)->create($this->profile, 'service', 'check', true)['id']);
        $a = $this->act($a, 'move');
        self::assertFalse($a['result']['passed']);
        self::assertTrue($a['result']['critical']);
        $this->postJson('/api/v1/attempts/'.$a['id'].'/practice', ['request_id' => (string) Str::uuid(), 'exercise_id' => 'unattended'])->assertConflict();
    }

    public function test_priority_requires_all_steps_and_timeout_is_applied_once(): void
    {
        $source = $this->source('service');
        $a = $this->exercise($source, 'priority');
        $a = $this->act($a, 'help_phone');
        $a = $this->act($a, 'ask_owner');
        $a = $this->act($a, 'stow');
        self::assertSame(75, $a['result']['score']);
        self::assertFalse($a['result']['passed']);
        $a = $this->exercise($source, 'priority');
        $state = AttemptState::restore(DB::table('attempts')->where('id', $a['id'])->value('state'));
        $state->deadline = app(AttemptService::class)->clock() - 1;
        DB::table('attempts')->where('id', $a['id'])->update(['state' => $state->json()]);
        $a = app(AttemptService::class)->load($this->profile, $a['id']);
        self::assertSame(55, $a['safety']);
        self::assertSame(55, app(AttemptService::class)->load($this->profile, $a['id'])['safety']);
        foreach (['clear_first', 'ask_owner', 'stow'] as $action) {
            $a = $this->act($a, $action);
        }
        self::assertFalse($a['result']['checks']['timely']);
        self::assertFalse($a['result']['passed']);
    }

    public function test_pause_reload_frozen_definition_and_successful_priority(): void
    {
        $source = $this->source('service');
        $a = $this->exercise($source, 'priority');
        [$status, $a] = app(AttemptService::class)->command($this->profile, $a['id'], 'pause', ['request_id' => (string) Str::uuid(), 'expected_revision' => $a['revision'], 'paused' => true]);
        self::assertSame(200, $status);
        $loaded = $this->getJson('/api/v1/attempts/'.$a['id'])->assertOk()->json();
        self::assertSame('paused', $loaded['status']);
        self::assertNull($loaded['deadline']);
        self::assertGreaterThan(40, $loaded['remaining']);
        $state = AttemptState::restore(DB::table('attempts')->where('id', $a['id'])->value('state'));
        self::assertSame(file_get_contents(app_path('../resources/practice/priority.json')), $state->practice->definition);
        self::assertFalse(DB::table('scenario_versions')->where('version', $a['version'])->exists());
        [, $a] = app(AttemptService::class)->command($this->profile, $a['id'], 'pause', ['request_id' => (string) Str::uuid(), 'expected_revision' => $a['revision'], 'paused' => false]);
        foreach (['clear_first', 'ask_owner', 'stow'] as $action) {
            $a = $this->act($a, $action);
        }
        self::assertTrue($a['result']['passed']);
    }

    public function test_communication_wrong_promise_and_unfinished_source(): void
    {
        $active = app(AttemptService::class)->create($this->profile, 'service', 'check', true);
        $this->postJson('/api/v1/attempts/'.$active['id'].'/practice', ['request_id' => (string) Str::uuid(), 'exercise_id' => 'communication'])->assertConflict();
        [, $source] = app(AttemptService::class)->command($this->profile, $active['id'], 'finish', ['request_id' => (string) Str::uuid(), 'expected_revision' => 0]);
        $a = $this->exercise($source, 'communication');
        $a = $this->act($a, 'promise_soon');
        $a = $this->act($a, 'follow_up');
        self::assertFalse($a['result']['passed']);
        self::assertFalse($a['result']['checks']['promise']);
    }

    public function test_tc001_tc002_profile_boundaries_and_saved_identity(): void
    {
        foreach (['А', str_repeat('А', 41)] as $name) {
            $this->patchJson('/api/v1/me', ['name' => $name, 'portrait' => 'chief_card'])->assertUnprocessable();
        }
        foreach (['Ан', str_repeat('А', 40)] as $name) {
            $this->patchJson('/api/v1/me', ['name' => $name, 'portrait' => 'chief_card'])->assertOk()->assertJsonPath('profile.name', $name);
            $this->getJson('/api/v1/bootstrap')->assertOk()->assertJsonPath('profile.id', $this->profile)->assertJsonPath('profile.portrait', 'chief_card')->assertJsonPath('profile.name', $name);
        }
        $this->patchJson('/api/v1/me', ['name' => 'Тест', 'portrait' => '../../secret'])->assertUnprocessable();
    }

    public function test_tc015_client_cannot_change_scores_or_unlock_rewards(): void
    {
        $a = app(AttemptService::class)->create($this->profile, 'security', 'check', true);
        $this->postJson('/api/v1/attempts/'.$a['id'].'/actions', [
            'request_id' => (string) Str::uuid(), 'expected_revision' => $a['revision'],
            'thread_id' => 'security', 'action_id' => 'warn',
            'loyalty_score' => 1000, 'safety' => 1000, 'is_achievement_unlocked' => true,
        ])->assertOk()->assertJsonPath('loyalty', 65)->assertJsonPath('safety', 90);
        self::assertSame(0, DB::table('awards')->where('profile_id', $this->profile)->count());
        self::assertSame(0, app(Progress::class)->summary($this->profile)['permanent']);
    }

    public function test_malformed_resource_ids_are_not_found_instead_of_database_errors(): void
    {
        $this->getJson('/api/v1/attempts/not-a-uuid')->assertNotFound();
        $this->postJson('/api/v1/attempts/100/actions', [])->assertNotFound();
        $this->postJson('/api/v1/attempts/100/practice', [])->assertNotFound();
        $this->patchJson('/api/v1/notifications/not-a-number', [])->assertNotFound();
    }

    public function test_tc010_reward_date_and_count_survive_duplicate_completion(): void
    {
        $a = app(AttemptService::class)->create($this->profile, 'security', 'train', true);
        foreach (['warn', 'notify', 'complete'] as $action) {
            $a = $this->act($a, $action, 'security');
        }
        $before = DB::table('awards')->where('profile_id', $this->profile)->get()->toJson();
        app(AttemptService::class)->load($this->profile, $a['id']);
        $response = app(AttemptService::class)->command($this->profile, $a['id'], 'finish', ['request_id' => (string) Str::uuid(), 'expected_revision' => $a['revision']]);
        self::assertSame(409, $response[0]);
        self::assertSame($before, DB::table('awards')->where('profile_id', $this->profile)->get()->toJson());
        self::assertSame(1, DB::table('awards')->where('profile_id', $this->profile)->count());
        self::assertSame(0, app(Progress::class)->summary($this->profile)['permanent']);
    }

    public function test_tc012_tc013_notifications_are_readable_deduplicated_and_expire(): void
    {
        DB::table('bonuses')->insert(['profile_id' => $this->profile, 'source' => 'case-bonus', 'points' => 20, 'expires_at' => now()->addSeconds(40), 'warning_seconds' => 60]);
        $notices = $this->getJson('/api/v1/notifications')->assertOk()->json();
        $kinds = array_unique(array_map(fn ($n) => explode(':', $n['event_key'])[0], $notices));
        self::assertCount(3, $kinds);
        foreach ($notices as $notice) {
            self::assertNotEmpty($notice['body']);
            $this->patchJson('/api/v1/notifications/'.$notice['id'], [])->assertOk();
        }
        self::assertSame(0, DB::table('notifications')->where('profile_id', $this->profile)->where('read', false)->count());
        $before = app(Progress::class)->summary($this->profile);
        self::assertSame(20, $before['bonus']);
        DB::table('bonuses')->where('profile_id', $this->profile)->update(['expires_at' => now()->subSecond()]);
        $noticesAfter = $this->getJson('/api/v1/notifications')->assertOk()->json();
        self::assertCount(count($notices), $noticesAfter);
        self::assertCount(1, array_filter($noticesAfter, fn ($n) => str_contains($n['title'], 'баллов истёк') && ! $n['read']));
        $after = app(Progress::class)->summary($this->profile);
        self::assertSame(0, $after['bonus']);
        self::assertSame($before['permanent'], $after['permanent']);
        self::assertSame($before['level'], $after['level']);
        $rank = $this->getJson('/api/v1/leaderboard?scope=company')->assertOk()->json();
        self::assertSame(0, array_values(array_filter($rank, fn ($r) => $r['id'] === $this->profile))[0]['total']);
    }

    public function test_tc011_ranking_scopes_and_order(): void
    {
        $base = ['name' => 'Сравнение', 'brigade' => 'Бригада №12', 'depot' => 'Москва'];
        $a = '11111111-0000-4000-8000-000000000001';
        $b = '11111111-0000-4000-8000-000000000002';
        $c = '11111111-0000-4000-8000-000000000003';
        foreach ([$a, $b, $c] as $id) {
            DB::table('profiles')->insert(['id' => $id] + $base);
            DB::table('best_results')->insert(['profile_id' => $id, 'scenario' => 'service', 'score' => $id === $a ? 90 : 100]);
        }
        DB::table('bonuses')->insert(['profile_id' => $a, 'source' => 'tie', 'points' => 10, 'expires_at' => now()->addHour()]);
        $rows = $this->getJson('/api/v1/leaderboard?scope=brigade')->assertOk()->json();
        $ids = array_values(array_filter(array_column($rows, 'id'), fn ($id) => in_array($id, [$a, $b, $c], true)));
        self::assertSame([$b, $c, $a], $ids);
        foreach (['brigade' => 'Бригада №12', 'depot' => 'Москва'] as $scope => $value) {
            foreach ($this->getJson('/api/v1/leaderboard?scope='.$scope)->assertOk()->json() as $row) {
                self::assertSame($value, $row[$scope]);
            }
        }
        self::assertGreaterThan(count($rows), count($this->getJson('/api/v1/leaderboard?scope=company')->assertOk()->json()));
    }

    public function test_tc017_frequent_unmet_criteria_link_to_real_source(): void
    {
        $first = $this->source();
        $second = $this->source();
        $this->source('service');
        $summary = $this->getJson('/api/v1/me/progress')->assertOk()->json();
        $touch = array_values(array_filter($summary['practice_focus'], fn ($row) => $row['label'] === 'Не перемещать вещь'))[0];
        self::assertSame(2, $touch['misses']);
        self::assertSame(2, $touch['observations']);
        self::assertContains($touch['source_attempt_id'], [$first['id'], $second['id']]);
        self::assertSame('unattended', $touch['exercise_id']);
        self::assertCount(3, array_unique(array_column($summary['competencies'], 'name')));
        $practice = $this->exercise($second, 'unattended');
        $practice = $this->act($practice, 'notify');
        $this->act($practice, 'warn');
        self::assertSame($summary['practice_focus'], $this->getJson('/api/v1/me/progress')->assertOk()->json('practice_focus'));
    }
}
