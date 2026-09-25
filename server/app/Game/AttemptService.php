<?php

declare(strict_types=1);

namespace App\Game;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class AttemptService
{
    public function __construct(private Engine $engine, private ScenarioCatalog $catalog, private Progress $progress) {}

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
        return ['id' => $id, 'server_time' => $this->clock(), 'scenario' => $state->scenario, 'version' => $state->version] + $this->engine->view($state, $scenario);
    }

    private function persist(StoredAttempt $row, AttemptState $s, Scenario $scenario): void
    {
        $values = ['state' => $s->json(), 'status' => $s->status->value, 'updated_at' => now()];
        if ($s->status === AttemptStatus::Completed && $row->finishedAt === null) {
            $r = $this->engine->result($s, $scenario);
            $values['result'] = json_encode($r, JSON_THROW_ON_ERROR);
            $values['finished_at'] = DB::raw('clock_timestamp()');
            DB::table('attempts')->where('id', $row->id)->update($values);
            $this->progress->record($row->profileId, $s, $r);

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
            $scenario = $this->catalog->get($s->scenario, $s->version);
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
            $scenario = $this->catalog->get($s->scenario, $s->version);
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
