<?php

declare(strict_types=1);

namespace App\Game;

use App\Practice\PracticeCatalog;
use App\Practice\PracticeContext;
use App\Practice\PracticeRecommendation;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class AttemptService
{
    public function __construct(private Engine $engine, private ScenarioCatalog $catalog, private Progress $progress, private PracticeCatalog $practice) {}

    public function clock(): float
    {
        return (float) DB::selectOne('select extract(epoch from clock_timestamp()) as time')->time;
    }

    public function create(string $profile, string $scenario, string $mode, bool $seat): array
    {
        return DB::transaction(function () use ($profile, $scenario, $mode, $seat) {
            DB::table('profiles')->where('id', $profile)->lockForUpdate()->first();
            $existing = DB::table('attempts')->where('profile_id', $profile)->where('status', '!=', 'completed')->first();
            if ($existing) {
                return $this->load($profile, $existing->id);
            }
            $definition = $this->catalog->get($scenario, ranked: $mode === 'check');
            $s = $definition->initialState($mode, $mode === 'check' || $seat, $this->clock());
            $id = (string) Str::uuid();
            DB::table('attempts')->insert(['id' => $id, 'profile_id' => $profile, 'scenario' => $scenario, 'version' => $s->version, 'mode' => $mode, 'status' => $s->status->value, 'state' => $s->json(), 'created_at' => now(), 'updated_at' => now()]);

            return $this->view($id, $s, $definition);
        });
    }

    private function view(string $id, AttemptState $state, Scenario $scenario): array
    {
        $context = $state->practice;

        return [
            'id' => $id, 'server_time' => $this->clock(), 'scenario' => $state->scenario, 'version' => $state->version,
            'practice' => $context === null ? null : [
                'id' => $context->id, 'source_attempt_id' => $context->sourceAttemptId,
                'before' => $context->before, 'intro' => $scenario->intro,
                'completed_steps' => count(array_filter($state->events, fn ($e) => $e['action'] !== 'Время истекло')),
            ],
            'practice_options' => $this->practice->recommendations($state, $scenario),
        ] + $this->engine->view($state, $scenario);
    }

    private function scenarioFor(AttemptState $state): Scenario
    {
        return $state->practice === null
            ? $this->catalog->get($state->scenario, $state->version)
            : Scenario::fromJson($state->practice->definition);
    }

    /** @return array{int,array} */
    public function startPractice(string $profile, string $sourceId, string $exerciseId, string $requestId): array
    {
        return DB::transaction(function () use ($profile, $sourceId, $exerciseId, $requestId) {
            DB::table('profiles')->where('id', $profile)->lockForUpdate()->first();
            $hash = hash('sha256', 'practice:'.$sourceId.':'.$exerciseId);
            $old = DB::table('processed_requests')->where('profile_id', $profile)->where('request_id', $requestId)->first();
            if ($old) {
                return $old->hash === $hash
                    ? [$old->status, json_decode($old->response, true, flags: JSON_THROW_ON_ERROR)]
                    : [409, ['error' => ['code' => 'idempotency_conflict', 'message' => 'Ключ уже использован']]];
            }
            $sourceRow = DB::table('attempts')->where('id', $sourceId)->where('profile_id', $profile)->lockForUpdate()->first();
            abort_unless($sourceRow, 404);
            $source = StoredAttempt::fromRow($sourceRow)->state;
            $selected = null;
            foreach ($this->practice->recommendations($source, $this->scenarioFor($source)) as $option) {
                if ($option->id === $exerciseId) {
                    $selected = $option;
                }
            }
            $activeAttemptId = DB::table('attempts')->where('profile_id', $profile)->where('status', '!=', 'completed')->value('id');
            if ($selected === null) {
                $response = [409, ['error' => ['code' => 'practice_unavailable', 'message' => 'Это упражнение не рекомендовано по выбранной смене.']]];
            } elseif ($activeAttemptId !== null) {
                $response = [409, ['error' => [
                    'code' => 'active_attempt',
                    'message' => 'У вас уже есть незавершённое прохождение. Продолжите его, прежде чем начинать новое упражнение.',
                    'active_attempt_id' => (string) $activeAttemptId,
                ]]];
            } else {
                $response = [200, $this->createPractice($profile, $sourceId, $selected)];
            }
            [$status, $body] = $response;
            DB::table('processed_requests')->insert(['profile_id' => $profile, 'request_id' => $requestId, 'hash' => $hash, 'status' => $status, 'response' => json_encode($body, JSON_THROW_ON_ERROR)]);

            return $response;
        });
    }

    private function createPractice(string $profile, string $sourceId, PracticeRecommendation $option): array
    {
        $definition = $this->practice->definition($option->id);
        $scenario = Scenario::fromJson($definition);
        $time = $this->clock();
        $state = $scenario->initialState('train', false, $time);
        $state->practice = new PracticeContext($option->id, $sourceId, $definition, $option->before);
        if ($option->id === 'priority') {
            $state->deadline = $time + $scenario->seconds;
        }
        $id = (string) Str::uuid();
        DB::table('attempts')->insert([
            'id' => $id, 'profile_id' => $profile, 'scenario' => $scenario->id, 'version' => $scenario->version,
            'mode' => 'train', 'status' => $state->status->value, 'state' => $state->json(),
            'practice_id' => $option->id, 'source_attempt_id' => $sourceId, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return $this->view($id, $state, $scenario);
    }

    private function persist(StoredAttempt $row, AttemptState $s, Scenario $scenario): void
    {
        $values = ['state' => $s->json(), 'status' => $s->status->value, 'updated_at' => now()];
        if ($s->status === AttemptStatus::Completed && $row->finishedAt === null) {
            $r = $this->engine->result($s, $scenario);
            $values['result'] = json_encode($r, JSON_THROW_ON_ERROR);
            $values['finished_at'] = DB::raw('clock_timestamp()');
            DB::table('attempts')->where('id', $row->id)->update($values);
            if ($s->practice === null) {
                $this->progress->record($row->profileId, $s, $r, $row->id);
            }

            return;
        }
        DB::table('attempts')->where('id', $row->id)->update($values);
    }

    public function load(string $profile, string $id): array
    {
        return DB::transaction(function () use ($profile, $id) {
            DB::table('profiles')->where('id', $profile)->lockForUpdate()->first();
            $row = DB::table('attempts')->where('id', $id)->where('profile_id', $profile)->lockForUpdate()->first();
            abort_unless($row, 404);
            $row = StoredAttempt::fromRow($row);
            $s = $row->state;
            $scenario = $this->scenarioFor($s);
            $this->engine->expire($s, $scenario, $this->clock());
            $this->persist($row, $s, $scenario);

            return $this->view($id, $s, $scenario);
        });
    }

    /** @param array{request_id:string,expected_revision:int,thread_id?:string,action_id?:string,paused?:bool} $input */
    public function command(string $profile, string $id, string $operation, array $input): array
    {
        $command = AttemptCommand::fromArray($operation, $input);

        return DB::transaction(function () use ($profile, $id, $command) {
            DB::table('profiles')->where('id', $profile)->lockForUpdate()->first();
            $hash = $command->fingerprint($id);
            $old = DB::table('processed_requests')->where('profile_id', $profile)->where('request_id', $command->requestId)->first();
            if ($old) {
                return $old->hash === $hash ? [$old->status, json_decode($old->response, true)] : [409, ['error' => ['code' => 'idempotency_conflict', 'message' => 'Ключ уже использован']]];
            }
            $row = DB::table('attempts')->where('id', $id)->where('profile_id', $profile)->lockForUpdate()->first();
            abort_unless($row, 404);
            $row = StoredAttempt::fromRow($row);
            $s = $row->state;
            $scenario = $this->scenarioFor($s);
            $time = $this->clock();
            $this->engine->expire($s, $scenario, $time);
            $status = 200;
            $error = null;
            try {
                $this->engine->execute($s, $scenario, $command, $time);
            } catch (\DomainException $e) {
                $status = 409;
                $error = ['code' => 'state_conflict', 'message' => $e->getMessage()];
            }
            $this->persist($row, $s, $scenario);
            $body = $this->view($id, $s, $scenario);
            if ($error) {
                $body = ['error' => $error, 'state' => $body];
            }
            DB::table('processed_requests')->insert(['profile_id' => $profile, 'request_id' => $command->requestId, 'hash' => $hash, 'status' => $status, 'response' => json_encode($body, JSON_THROW_ON_ERROR)]);

            return [$status, $body];
        });
    }

    public function tick(): void
    {
        foreach (DB::table('attempts')->where('status', 'active')->select('id', 'profile_id')->get() as $a) {
            $this->load($a->profile_id, $a->id);
        }
        foreach (DB::table('profiles')->pluck('id') as $id) {
            $this->progress->syncNotifications($id);
        }
        DB::table('worker_heartbeats')->updateOrInsert(['id' => 'main'], ['last_success' => now()]);
    }
}
