<?php

declare(strict_types=1);

namespace App\Editor;

use App\Game\AttemptCommand;
use App\Game\AttemptState;
use App\Game\Engine;
use App\Game\Scenario;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Separate storage prevents editor trials from entering any employee result or reward. */
final class PreviewService
{
    public function __construct(private Engine $engine, private EditorService $editor) {}

    private function clock(): float
    {
        return (float) DB::selectOne('select extract(epoch from clock_timestamp()) as time')->time;
    }

    public function start(string $profile, string $draftId, int $revision, bool $seat): array
    {
        return DB::transaction(function () use ($profile, $draftId, $revision, $seat) {
            DB::table('profiles')->where('id', $profile)->lockForUpdate()->first();
            $draft = $this->editor->draft($profile, $draftId, true);
            if ($draft->revision !== $revision) {
                throw new \DomainException('Черновик изменился. Загрузите сохранённую версию.');
            }
            $scenario = $this->editor->validate($draft);
            $id = (string) Str::uuid();
            DB::table('editor_previews')->updateOrInsert(['profile_id' => $profile], ['id' => $id,
                'definition' => $draft->content->json, 'state' => $scenario->initialState('train', $seat, $this->clock())->json()]);

            return $this->load($profile, $id);
        });
    }

    /** @return array{int,array} */
    public function command(string $profile, string $id, AttemptCommand $command): array
    {
        return $this->transition($profile, $id, $command);
    }

    public function load(string $profile, string $id): array
    {
        return $this->transition($profile, $id, null)[1];
    }

    private function transition(string $profile, string $id, ?AttemptCommand $command): array
    {
        return DB::transaction(function () use ($profile, $id, $command) {
            DB::table('profiles')->where('id', $profile)->lockForUpdate()->first();
            $row = DB::table('editor_previews')->where('profile_id', $profile)->where('id', $id)->lockForUpdate()->first();
            abort_unless($row, 404);
            $hash = $command?->fingerprint('editor:'.$id);
            if ($command) {
                $old = DB::table('processed_requests')->where('profile_id', $profile)->where('request_id', $command->requestId)->first();
                if ($old) {
                    return $old->hash === $hash ? [$old->status, json_decode($old->response, true, flags: JSON_THROW_ON_ERROR)]
                        : [409, ['error' => ['message' => 'Ключ уже использован для другого действия.']]];
                }
            }
            $scenario = Scenario::fromJson($row->definition);
            $state = AttemptState::restore($row->state);
            $time = $this->clock();
            $this->engine->expire($state, $scenario, $time);
            $error = null;
            if ($command) {
                try {
                    $this->engine->execute($state, $scenario, $command, $time);
                } catch (\DomainException $e) {
                    $error = $e->getMessage();
                }
            }
            DB::table('editor_previews')->where('id', $id)->update(['state' => $state->json()]);
            $view = ['id' => $id, 'server_time' => $this->clock()] + $this->engine->view($state, $scenario);
            $status = $error === null ? 200 : 409;
            $body = $error === null ? $view : ['error' => ['message' => $error], 'state' => $view];
            if ($command) {
                DB::table('processed_requests')->insert(['profile_id' => $profile, 'request_id' => $command->requestId,
                    'hash' => $hash, 'status' => $status, 'response' => json_encode($body, JSON_THROW_ON_ERROR)]);
            }

            return [$status, $body];
        });
    }
}
