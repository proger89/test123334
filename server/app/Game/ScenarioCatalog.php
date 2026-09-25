<?php

declare(strict_types=1);

namespace App\Game;

use Illuminate\Support\Facades\DB;

final class ScenarioCatalog
{
    public function get(string $id, ?string $version = null, bool $ranked = false): Scenario
    {
        $q = DB::table('scenario_versions')->where('scenario', $id);
        if ($version !== null) {
            $q->where('version', $version);
        }
        if ($ranked) {
            $q->where('ranked', true);
        }
        $row = $q->orderByDesc('id')->first();
        abort_unless($row, 404, 'Сценарий не найден');

        return Scenario::fromJson($row->definition);
    }

    public function publish(string $json, bool $ranked = false): void
    {
        $s = Scenario::fromJson($json);
        $existing = DB::table('scenario_versions')->where('scenario', $s->id)->where('version', $s->version)->first();
        $hash = hash('sha256', $json);
        if ($existing) {
            if ($existing->checksum !== $hash) {
                throw new \DomainException('Опубликованная версия неизменяема');
            }

            return;
        }
        DB::table('scenario_versions')->insert(['scenario' => $s->id, 'version' => $s->version, 'definition' => $json, 'checksum' => $hash, 'ranked' => $ranked, 'created_at' => now(), 'updated_at' => now()]);
    }
}
