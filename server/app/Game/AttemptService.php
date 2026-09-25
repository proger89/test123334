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
            }$definition = $this->catalog->get($scenario, ranked: $mode === 'check');
            $s = $definition->initialState($mode, $mode === 'check' || $seat, $this->clock());
            $id = (string) Str::uuid();
            DB::table('attempts')->insert(['id' => $id, 'profile_id' => $profile, 'scenario' => $scenario, 'version' => $s->version, 'mode' => $mode, 'status' => $s->status, 'state' => $s->json(), 'created_at' => now(), 'updated_at' => now()]);

            return $this->view($id, $s, $definition);
        });
    }

    private function view(string $id, AttemptState $state, Scenario $scenario): array
    {
        return ['id' => $id, 'server_time' => $this->clock(), 'scenario' => $state->scenario, 'version' => $state->version] + $this->engine->view($state, $scenario);
    }

    private function persist(object $row, AttemptState $s, Scenario $scenario): void
    {
        $values = ['state' => $s->json(), 'status' => $s->status, 'updated_at' => now()];
        if ($s->status === 'completed' && $row->finished_at === null) {
            $r = $this->engine->result($s, $scenario);
            $values['result'] = json_encode($r, JSON_THROW_ON_ERROR);
            $values['finished_at'] = now();
            DB::table('attempts')->where('id', $row->id)->update($values);
            $this->progress->record($row->profile_id, $s, $r);

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
            $s = AttemptState::restore($row->state);
            $scenario = $this->catalog->get($s->scenario, $s->version);
            $this->engine->expire($s, $scenario, $this->clock());
            $this->persist($row, $s, $scenario);

            return $this->view($id, $s, $scenario);
        });
    }

    /** @param array{request_id:string,expected_revision:int,thread_id?:string,action_id?:string,paused?:bool} $input */
    public function command(string $profile, string $id, string $operation, array $input): array
    {
        return DB::transaction(function () use ($profile, $id, $operation, $input) {
            DB::table('profiles')->where('id', $profile)->lockForUpdate()->first();
            ksort($input);
            $hash = hash('sha256', $id.$operation.json_encode($input));
            $old = DB::table('processed_requests')->where('profile_id', $profile)->where('request_id', $input['request_id'])->first();
            if ($old) {
                return $old->hash === $hash ? [$old->status, json_decode($old->response, true)] : [409, ['error' => ['code' => 'idempotency_conflict', 'message' => 'Ключ уже использован']]];
            }
            $row = DB::table('attempts')->where('id', $id)->where('profile_id', $profile)->lockForUpdate()->first();
            abort_unless($row, 404);
            $s = AttemptState::restore($row->state);
            $scenario = $this->catalog->get($s->scenario, $s->version);
            $time = $this->clock();
            $this->engine->expire($s, $scenario, $time);
            $status = 200;
            $error = null;
            try {
                if ($input['expected_revision'] !== $s->revision) {
                    throw new \DomainException('Состояние обновилось. Повторите выбор.');
                }
                if ($s->status === 'completed') {
                    throw new \DomainException('Попытка завершена');
                }
                if ($operation === 'actions') {
                    $this->engine->act($s, $scenario, $input['thread_id'], $input['action_id'], $time);
                } elseif ($operation === 'pause') {
                    if ($s->mode !== 'train') {
                        throw new \DomainException('Проверку нельзя приостановить');
                    }
                    if ($input['paused'] && $s->status === 'active') {
                        $s->remaining = $s->deadline === null ? null : max(0, $s->deadline - $time);
                        $s->deadline = null;
                        $s->eventRemaining = $s->eventAt === null ? null : max(0, $s->eventAt - $time);
                        $s->eventAt = null;
                        $s->status = 'paused';
                        $s->revision++;
                    } elseif (! $input['paused'] && $s->status === 'paused') {
                        $s->deadline = $s->remaining === null ? null : $time + $s->remaining;
                        $s->remaining = null;
                        $s->eventAt = $s->eventRemaining === null ? null : $time + $s->eventRemaining;
                        $s->eventRemaining = null;
                        $s->status = 'active';
                        $s->revision++;
                    }
                } elseif ($operation === 'finish') {
                    $s->status = 'completed';
                    $s->reason = 'user_exit';
                    $s->revision++;
                }
            } catch (\DomainException $e) {
                $status = 409;
                $error = ['code' => 'state_conflict', 'message' => $e->getMessage()];
            }
            $this->persist($row, $s, $scenario);
            $body = $this->view($id, $s, $scenario);
            if ($error) {
                $body = ['error' => $error, 'state' => $body];
            }
            DB::table('processed_requests')->insert(['profile_id' => $profile, 'request_id' => $input['request_id'], 'hash' => $hash, 'status' => $status, 'response' => json_encode($body, JSON_THROW_ON_ERROR)]);

            return [$status, $body];
        });
    }

    public function tick(): void
    {
        foreach (DB::table('attempts')->where('status', 'active')->select('id', 'profile_id')->get() as $a) {
            $this->load($a->profile_id,$a->id);
        }
        foreach (DB::table('profiles')->pluck('id') as $id) {
            $this->progress->syncNotifications($id);
        }
        DB::table('worker_heartbeats')->updateOrInsert(['id' => 'main'],['last_success' => now()]);
    }
}
