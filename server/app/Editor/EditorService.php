<?php

declare(strict_types=1);

namespace App\Editor;

use App\Game\Scenario;
use App\Game\ScenarioCatalog;
use Illuminate\Support\Facades\DB;

final class EditorService
{
    public function __construct(private EditorValidator $validator, private ScenarioCatalog $catalog) {}

    public function draft(string $profile, string $id, bool $lock = false): EditorDraft
    {
        $query = DB::table('scenario_drafts')->where('profile_id', $profile)->where('id', $id);
        $row = ($lock ? $query->lockForUpdate() : $query)->first();
        abort_unless($row, 404);

        return EditorDraft::fromRow($row);
    }

    public function create(string $profile, string $id, string $scenario, string $version): EditorDraft
    {
        return DB::transaction(function () use ($profile, $id, $scenario, $version) {
            DB::table('profiles')->where('id', $profile)->lockForUpdate()->first();
            $existing = DB::table('scenario_drafts')->where('id', $id)->first();
            if ($existing) {
                abort_unless($existing->profile_id === $profile, 404);
                if ($existing->scenario !== $scenario || $existing->base_version !== $version) {
                    throw new \DomainException('Ключ создания уже использован для другого черновика.');
                }

                return EditorDraft::fromRow($existing);
            }
            $source = DB::table('scenario_versions')->where('scenario', $scenario)->where('version', $version)->first();
            abort_unless($source, 404);
            DB::table('scenario_drafts')->insert(['id' => $id, 'profile_id' => $profile, 'scenario' => $scenario, 'base_version' => $version,
                'definition' => $source->definition, 'revision' => 0, 'created_at' => now(), 'updated_at' => now()]);

            return $this->draft($profile, $id);
        });
    }

    public function save(string $profile, string $id, int $revision, DraftContent $content): EditorDraft
    {
        return DB::transaction(function () use ($profile, $id, $revision, $content) {
            $draft = $this->draft($profile, $id, true);
            $draft->assertEditable($revision);
            if ($content->scenario !== $draft->content->scenario) {
                throw new \InvalidArgumentException('Тип смены нельзя менять внутри черновика.');
            }
            DB::table('scenario_drafts')->where('id', $id)->update(['definition' => $content->withVersion($draft->baseVersion)->json,
                'revision' => $revision + 1, 'updated_at' => now()]);

            return $this->draft($profile, $id);
        });
    }

    public function validate(EditorDraft $draft): Scenario
    {
        return $this->validator->validate($draft->content, $this->catalog->get($draft->content->scenario, '1'));
    }

    /** @return list<string> */
    public function issues(EditorDraft $draft): array
    {
        try {
            $this->validate($draft);

            return [];
        } catch (\InvalidArgumentException $e) {
            return [str_starts_with($e->getMessage(), 'Сценарий не соответствует JSON Schema')
                ? 'Проверьте обязательные тексты, сроки от 1 до 600 секунд и последствия от −100 до 100.' : $e->getMessage()];
        }
    }

    public function publish(string $profile, string $id, int $revision): EditorDraft
    {
        return DB::transaction(function () use ($profile, $id, $revision) {
            $draft = $this->draft($profile, $id, true);
            if ($draft->publishedVersion !== null) {
                if ($draft->revision !== $revision) {
                    throw new \DomainException('Опубликована другая редакция черновика. Загрузите её перед продолжением.');
                }

                return $draft;
            }
            $draft->assertEditable($revision);
            $this->validate($draft);
            DB::select('select pg_advisory_xact_lock(742619)');
            $versions = DB::table('scenario_versions')->where('scenario', $draft->content->scenario)->pluck('version');
            $numbers = $versions->filter(fn (string $version) => ctype_digit($version))->map(fn (string $version) => (int) $version);
            $version = (string) ($numbers->max() + 1);
            $this->catalog->publish($draft->content->withVersion($version)->json);
            DB::table('scenario_drafts')->where('id', $id)->update(['published_version' => $version, 'updated_at' => now()]);

            return $this->draft($profile, $id);
        });
    }
}
