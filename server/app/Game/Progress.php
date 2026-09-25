<?php

declare(strict_types=1);

namespace App\Game;

use Illuminate\Support\Facades\DB;

final class Progress
{
    public function notice(string $profile, string $key, string $title, string $target): void
    {
        DB::table('notifications')->insertOrIgnore(['profile_id' => $profile, 'event_key' => $key, 'title' => $title, 'target' => $target, 'created_at' => now(), 'updated_at' => now()]);
    }

    private function award(string $profile, string $code, string $title): void
    {
        DB::table('awards')->insertOrIgnore(['profile_id' => $profile, 'code' => $code, 'title' => $title, 'created_at' => now(), 'updated_at' => now()]);
    }

    public function record(string $profile, AttemptState $s, array $result): void
    {
        $this->award($profile, 'first', 'Первое завершение');
        if ($s->mode !== 'check' || ! $result['passed']) {
            return;
        }
        $ranked = DB::table('scenario_versions')->where('scenario', $s->scenario)->where('version', $s->version)->value('ranked');
        if (! $ranked) {
            return;
        }
        $q = DB::table('best_results')->where('profile_id', $profile)->where('scenario', $s->scenario)->where('score_set', 'vsm-hackathon-2026');
        $old = $q->value('score');
        if ($old === null) {
            DB::table('best_results')->insert(['profile_id' => $profile, 'scenario' => $s->scenario, 'score' => $result['score'], 'score_set' => 'vsm-hackathon-2026']);
        } elseif ($result['score'] > $old) {
            $q->update(['score' => $result['score']]);
        }
        if ($s->scenario === 'service' && ($s->checks['timely'] ?? false)) {
            $this->award($profile, 'service', 'Свободный проход');
        }
        if ($s->scenario === 'security') {
            $this->award($profile, 'security', 'Внимание к обстоятельствам');
        }
        if (DB::table('best_results')->where('profile_id', $profile)->count() === 2) {
            $this->award($profile, 'both', 'Две смены');
        }
        $entry = DB::table('challenge_entries')->where('profile_id', $profile)->first();
        if (! $entry || $entry->completed_at || now()->gte($entry->expires_at)) {
            return;
        }
        $passed = DB::table('attempts')->where('profile_id', $profile)->where('mode', 'check')->where('version', '1')->where('finished_at', '>=', $entry->joined_at)->where('finished_at', '<', $entry->expires_at)->get()->filter(fn ($a) => json_decode($a->result ?? '{}', true)['passed'] ?? false)->pluck('scenario')->unique()->count();
        if ($passed === 2) {
            DB::table('challenge_entries')->where('profile_id', $profile)->update(['completed_at' => now()]);
            DB::table('bonuses')->insertOrIgnore(['profile_id' => $profile, 'source' => 'challenge', 'points' => 20, 'expires_at' => now()->addDay()]);
        }
    }

    public function syncNotifications(string $profile): void
    {
        foreach (DB::table('scenario_versions')->get() as $s) {
            $this->notice($profile, 'scenario:'.$s->scenario.':'.$s->version, 'Доступен сценарий: '.json_decode($s->definition, true)['title'], 'scenarios');
        }
        $this->notice($profile, 'challenge:both', 'Испытание: пройдите две проверки за 24 часа', 'progress');
        foreach (DB::table('bonuses')->where('profile_id', $profile)->where('expires_at', '>', now())->get() as $b) {
            if (now()->addSeconds($b->warning_seconds)->gte($b->expires_at)) {
                $this->notice($profile, 'bonus:'.$b->id, 'Скоро истекут '.$b->points.' временных баллов', 'progress');
            }
        }
    }

    public function summary(string $profile): array
    {
        $permanent = (int) DB::table('best_results')->where('profile_id', $profile)->sum('score');
        $bonus = (int) DB::table('bonuses')->where('profile_id', $profile)->where('expires_at', '>', now())->sum('points');
        $history = DB::table('attempts')->where('profile_id', $profile)->where('status', 'completed')->orderByDesc('finished_at')->limit(100)->get();
        $competencies = [];
        $counts = [];
        foreach ($history as $attempt) {
            $key = $attempt->mode.':'.$attempt->scenario.':'.$attempt->version;
            if (($counts[$key] ?? 0) >= 5) {
                continue;
            }$counts[$key] = ($counts[$key] ?? 0) + 1;
            $r = json_decode($attempt->result, true);
            foreach ($r['competencies'] as $name => $c) {
                $k = $key.':'.$name;
                $old = $competencies[$k] ?? ['scenario' => $attempt->scenario, 'version' => $attempt->version, 'mode' => $attempt->mode, 'name' => $name, 'total' => 0, 'passed' => 0, 'critical' => false, 'attempts' => 0];
                $old['total'] += $c['total'];
                $old['passed'] += $c['passed'];
                $old['critical'] = $old['critical'] || $c['status'] === 'critical_failure';
                $old['attempts']++;
                $competencies[$k] = $old;
            }
        }
        foreach ($competencies as &$c) {
            $c['percent'] = $c['critical'] ? null : (int) round(100 * $c['passed'] / $c['total']);
        }

        return ['permanent' => $permanent, 'bonus' => $bonus, 'total' => $permanent + $bonus, 'level' => $permanent >= 200 ? 4 : ($permanent >= 100 ? 3 : ($permanent >= 50 ? 2 : 1)), 'awards' => DB::table('awards')->where('profile_id', $profile)->get(), 'best' => DB::table('best_results')->where('profile_id', $profile)->get(), 'challenge' => DB::table('challenge_entries')->where('profile_id', $profile)->first(), 'bonuses' => DB::table('bonuses')->where('profile_id', $profile)->where('expires_at', '>', now())->get(), 'competencies' => array_values($competencies), 'history' => $history->map(fn ($a) => ['id' => $a->id, 'scenario' => $a->scenario, 'mode' => $a->mode, 'finished_at' => $a->finished_at, 'result' => json_decode($a->result,true)])];
    }
}
