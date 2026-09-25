<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Game\AttemptService;
use App\Game\Progress;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class EditorTest extends TestCase
{
    use DatabaseTransactions;

    private string $profile;

    private const CODE = 'test-editor-code-at-least-16';

    protected function setUp(): void
    {
        parent::setUp();
        self::assertSame('vsm_test', config('database.connections.pgsql.database'));
        $this->profile = (string) Str::uuid();
        DB::table('profiles')->insert(['id' => $this->profile, 'name' => 'Автор', 'brigade' => 'Бригада №12', 'depot' => 'Москва']);
        config(['editor.access_code' => self::CODE]);
        $this->withSession(['profile_id' => $this->profile]);
    }

    private function login(): void
    {
        $this->postJson('/api/v1/editor/login', ['code' => self::CODE])->assertOk()->assertJsonPath('authorized', true);
    }

    private function draft(string $scenario = 'security'): array
    {
        return $this->postJson('/api/v1/editor/drafts', ['request_id' => (string) Str::uuid(), 'scenario' => $scenario, 'version' => '1'])->assertOk()->json();
    }

    private function save(array $draft, object $definition): array
    {
        return $this->putJson('/api/v1/editor/drafts/'.$draft['id'], ['expected_revision' => $draft['revision'], 'definition' => json_encode($definition)])->assertOk()->json();
    }

    private function definition(array $draft): object
    {
        return json_decode(DB::table('scenario_drafts')->where('id', $draft['id'])->value('definition'));
    }

    public function test_access_requires_code_expires_and_cannot_read_other_profiles(): void
    {
        $this->getJson('/api/v1/editor')->assertForbidden();
        $this->postJson('/api/v1/editor/login', ['code' => 'wrong'])->assertForbidden();
        $this->login();
        $d = $this->draft();
        $this->withSession(['editor_until' => time() - 1]);
        $this->getJson('/api/v1/editor')->assertForbidden();
        $this->login();
        $other = (string) Str::uuid();
        DB::table('profiles')->insert(['id' => $other, 'name' => 'Другой', 'brigade' => 'Б', 'depot' => 'М']);
        $this->withSession(['profile_id' => $other]);
        $this->getJson('/api/v1/editor/drafts/'.$d['id'])->assertNotFound();
        $this->postJson('/api/v1/editor/drafts/'.$d['id'].'/publish', ['expected_revision' => 0])->assertNotFound();
        $this->postJson('/api/v1/editor/logout')->assertOk();
        $this->getJson('/api/v1/editor')->assertForbidden();
    }

    public function test_both_baselines_are_valid_and_create_is_repeat_safe(): void
    {
        $this->login();
        foreach (['service', 'security'] as $scenario) {
            $key = (string) Str::uuid();
            $body = ['request_id' => $key, 'scenario' => $scenario, 'version' => '1'];
            $first = $this->postJson('/api/v1/editor/drafts', $body)->assertOk()->assertJsonPath('issues', [])->json();
            $this->postJson('/api/v1/editor/drafts', $body)->assertOk()->assertExactJson($first);
            $body['scenario'] = $scenario === 'service' ? 'security' : 'service';
            $this->postJson('/api/v1/editor/drafts', $body)->assertConflict();
        }
    }

    public function test_invalid_draft_can_be_saved_but_not_published_or_previewed(): void
    {
        $this->login();
        $d = $this->draft();
        $definition = $this->definition($d);
        $definition->nodes->s0->actions[0]->next = 'missing';
        $d = $this->save($d, $definition);
        self::assertNotEmpty($d['issues']);
        $this->postJson('/api/v1/editor/drafts/'.$d['id'].'/publish', ['expected_revision' => $d['revision']])->assertUnprocessable();
        $this->postJson('/api/v1/editor/drafts/'.$d['id'].'/preview', ['expected_revision' => $d['revision'], 'seat' => true])->assertUnprocessable();
        $definition->nodes->s0->actions[0]->next = 's0';
        $definition->nodes->orphan = clone $definition->nodes->s0;
        $d = $this->save($d, $definition);
        self::assertStringContainsString('нельзя добраться', $d['issues'][0]);
    }

    public function test_conflicting_save_keeps_first_writer_and_published_copy_is_immutable(): void
    {
        $this->login();
        $d = $this->draft();
        $definition = $this->definition($d);
        $definition->title = 'Уточнённая смена';
        $saved = $this->save($d, $definition);
        $this->putJson('/api/v1/editor/drafts/'.$d['id'], ['expected_revision' => 0, 'definition' => json_encode($definition)])->assertConflict();
        self::assertSame('Уточнённая смена', $this->definition($d)->title);
        $url = '/api/v1/editor/drafts/'.$d['id'].'/publish';
        $body = ['expected_revision' => $saved['revision']];
        $published = $this->postJson($url, $body)->assertOk()->json();
        $this->postJson($url, $body)->assertOk()->assertExactJson($published);
        $this->putJson('/api/v1/editor/drafts/'.$d['id'], ['expected_revision' => $saved['revision'], 'definition' => json_encode($definition)])->assertConflict();
        self::assertSame(1, DB::table('scenario_versions')->where('scenario', 'security')->where('version', $published['published_version'])->count());
    }

    public function test_publication_preserves_old_attempt_and_ranked_version(): void
    {
        $attempts = app(AttemptService::class);
        $old = $attempts->create($this->profile, 'security', 'train', true);
        $this->login();
        $d = $this->draft();
        $definition = $this->definition($d);
        $definition->nodes->s0->text = 'Обновлённое описание';
        $d = $this->save($d, $definition);
        $published = $this->postJson('/api/v1/editor/drafts/'.$d['id'].'/publish', ['expected_revision' => $d['revision']])->assertOk()->json();
        $catalog = $this->getJson('/api/v1/scenarios')->assertOk()->json();
        $security = collect($catalog)->firstWhere('id', 'security');
        self::assertSame($published['published_version'], $security['version']);
        self::assertSame('1', $security['check']['version']);
        self::assertSame('1', $attempts->load($this->profile, $old['id'])['version']);
        $attempts->command($this->profile, $old['id'], 'finish', ['request_id' => (string) Str::uuid(), 'expected_revision' => $old['revision']]);
        $new = $attempts->create($this->profile, 'security', 'train', true);
        self::assertSame($published['published_version'], $new['version']);
        self::assertSame('Обновлённое описание', $new['threads'][0]['text']);
        $attempts->command($this->profile, $new['id'], 'finish', ['request_id' => (string) Str::uuid(), 'expected_revision' => $new['revision']]);
        self::assertSame('1', $attempts->create($this->profile, 'security', 'check', true)['version']);
    }

    public function test_preview_is_isolated_repeat_safe_and_uses_frozen_draft(): void
    {
        $this->login();
        $d = $this->draft();
        $before = app(Progress::class)->summary($this->profile);
        $p = $this->postJson('/api/v1/editor/drafts/'.$d['id'].'/preview', ['expected_revision' => 0, 'seat' => true])->assertOk()->json();
        $definition = $this->definition($d);
        $definition->nodes->s0->text = 'Другой текст';
        $this->save($d, $definition);
        $loaded = $this->getJson('/api/v1/editor/previews/'.$p['id'])->assertOk()->json();
        self::assertNotSame('Другой текст', $loaded['threads'][0]['text']);
        $body = ['request_id' => (string) Str::uuid(), 'expected_revision' => $p['revision'], 'thread_id' => 'security', 'action_id' => 'move'];
        $url = '/api/v1/editor/previews/'.$p['id'].'/actions';
        $reply = $this->postJson($url, $body)->assertOk()->assertJsonPath('result.critical', true)->json();
        $this->postJson($url, $body)->assertOk()->assertExactJson($reply);
        $body['action_id'] = 'notify';
        $this->postJson($url, $body)->assertConflict();
        self::assertEquals($before, app(Progress::class)->summary($this->profile));
        self::assertSame(0, DB::table('attempts')->where('profile_id', $this->profile)->count());
    }

    public function test_dead_ends_unknown_flags_and_rubric_changes_are_rejected(): void
    {
        $this->login();
        $d = $this->draft();
        $original = $this->definition($d);
        $bad = clone $original;
        $bad->nodes = json_decode(json_encode($original->nodes));
        foreach ($bad->nodes->s0->actions as $a) {
            $a->when = (object) ['seat' => true];
        }
        $d = $this->save($d, $bad);
        self::assertNotEmpty($d['issues']);
        $bad = json_decode(json_encode($original));
        $bad->nodes->s0->actions[0]->flags = (object) ['unknown' => true];
        $d = $this->save($d, $bad);
        self::assertStringContainsString('неизвестное условие', $d['issues'][0]);
        $bad = json_decode(json_encode($original));
        $bad->rubric->touch->label = 'Другой критерий';
        $d = $this->save($d, $bad);
        self::assertNotEmpty($d['issues']);
    }

    public function test_malformed_shape_is_rejected_and_numeric_step_reports_a_content_error(): void
    {
        $this->login();
        $d = $this->draft();
        $this->putJson('/api/v1/editor/drafts/'.$d['id'], ['expected_revision' => 0, 'definition' => '{"id":"security"}'])->assertUnprocessable();
        $definition = $this->definition($d);
        $definition->nodes->{'123'} = clone $definition->nodes->s0;
        $saved = $this->save($d, $definition);
        self::assertNotEmpty($saved['issues']);
    }
}
