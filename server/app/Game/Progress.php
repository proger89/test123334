<?php

declare(strict_types=1);

namespace App\Game;

use App\Practice\PracticeCatalog;
use App\Practice\PracticeFocus;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class Progress
{
    public function notice(string $profile, string $key, string $title, string $target): void
    {
        DB::table('notifications')->insertOrIgnore(['profile_id' => $profile, 'event_key' => $key, 'title' => $title, 'target' => $target, 'created_at' => now(), 'updated_at' => now()]);
    }

    private function award(string $profile, Achievement $achievement, ?string $attemptId): void
    {
        DB::table('awards')->insertOrIgnore(['profile_id' => $profile, 'code' => $achievement->value, 'title' => $achievement->title(), 'attempt_id' => $attemptId, 'created_at' => now(), 'updated_at' => now()]);
    }

    public function record(string $profile, AttemptState $s, AttemptResult $result, ?string $attemptId = null): void
    {
        $this->award($profile, Achievement::First, $attemptId);
        if ($s->mode !== 'check' || ! $result->passed) {
            return;
        }
        $ranked = DB::table('scenario_versions')->where('scenario', $s->scenario)->where('version', $s->version)->value('ranked');
        if (! $ranked) {
            return;
        }
        $q = DB::table('best_results')->where('profile_id', $profile)->where('scenario', $s->scenario)->where('score_set', 'vsm-hackathon-2026');
        $old = $q->value('score');
        if ($old === null) {
            DB::table('best_results')->insert(['profile_id' => $profile, 'scenario' => $s->scenario, 'score' => $result->score, 'score_set' => 'vsm-hackathon-2026']);
        } elseif ($result->score > $old) {
            $q->update(['score' => $result->score]);
        }
        if ($s->scenario === 'service' && ($s->checks['timely'] ?? false)) {
            $this->award($profile, Achievement::Service, $attemptId);
        }
        if ($s->scenario === 'security') {
            $this->award($profile, Achievement::Security, $attemptId);
        }
        if (DB::table('best_results')->where('profile_id', $profile)->count() === 2) {
            $this->award($profile, Achievement::Both, $attemptId);
        }
        $entry = DB::table('challenge_entries')->where('profile_id', $profile)->first();
        if (! $entry || $entry->completed_at) {
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
        $this->notice($profile, 'challenge:both', 'Испытание «Две ситуации — два решения»', 'progress');
        foreach (DB::table('bonuses')->where('profile_id', $profile)->where('expires_at', '>', now())->get() as $b) {
            if (now()->addSeconds($b->warning_seconds)->gte($b->expires_at)) {
                $this->notice($profile, 'bonus:'.$b->id, 'Скоро истекут '.$b->points.' временных баллов', 'progress');
            }
        }
        foreach (DB::table('bonuses')->where('profile_id', $profile)->where('expires_at', '<=', now())->get() as $bonus) {
            $key = 'bonus:'.$bonus->id;
            $title = 'Срок '.$bonus->points.' временных баллов истёк';
            $this->notice($profile, $key, $title, 'progress');
            DB::table('notifications')->where('profile_id', $profile)->where('event_key', $key)
                ->where('title', '!=', $title)->update(['title' => $title, 'read' => false, 'updated_at' => now()]);
        }
    }

    public function summary(string $profile): array
    {
        $permanent = (int) DB::table('best_results')->where('profile_id', $profile)->sum('score');
        $bonus = (int) DB::table('bonuses')->where('profile_id', $profile)->where('expires_at', '>', now())->sum('points');
        $history = DB::table('attempts')->where('profile_id', $profile)->whereNull('practice_id')->where('status', 'completed')->orderByDesc('finished_at')->limit(100)->get();
        $observations = DB::query()->fromSub(
            DB::table('attempts')->where('profile_id', $profile)->whereNull('practice_id')->where('status', 'completed')
                ->selectRaw('*, row_number() over (partition by scenario, version, mode order by finished_at desc, id desc) as observation_number'),
            'observations'
        )->where('observation_number', '<=', 5)->orderByDesc('finished_at')->orderByDesc('id')->get();
        $competencies = [];
        $counts = [];
        $focus = [];
        $practiceCatalog = new PracticeCatalog;
        foreach ($observations as $attempt) {
            $key = $attempt->mode.':'.$attempt->scenario.':'.$attempt->version;
            if (($counts[$key] ?? 0) >= 5) {
                continue;
            }
            $counts[$key] = ($counts[$key] ?? 0) + 1;
            $r = json_decode($attempt->result, true);
            foreach ($r['rubric'] as $check => $rule) {
                $focusKey = $key.':'.$check;
                $entry = $focus[$focusKey] ??= new PracticeFocus($rule['label'], $attempt->scenario, $attempt->version, $attempt->mode, $practiceCatalog->exerciseForCheck($attempt->scenario, $check));
                $entry->observations++;
                if (! $r['checks'][$check]) {
                    $entry->misses++;
                    $entry->source_attempt_id ??= $attempt->id;
                }
            }
            foreach ($r['competencies'] as $name => $c) {
                $k = $key.':'.$name;
                $entry = $competencies[$k] ??= new CompetencySummary(
                    $attempt->scenario, $attempt->version, $attempt->mode, $name,
                    $attempt->id, $attempt->finished_at, $c['percent'],
                    $c['status'] === 'critical_failure', $c['passed'], $c['total'],
                );
                $entry->observe($c['passed'], $c['total'], $c['status'] === 'critical_failure');
            }
        }

        $practiceFocus = array_values(array_filter($focus, fn (PracticeFocus $item) => $item->misses > 0));
        usort($practiceFocus, fn (PracticeFocus $a, PracticeFocus $b) => ($b->misses <=> $a->misses) ?: strcmp($a->label, $b->label));
        $practiceFocus = array_slice($practiceFocus, 0, 5);

        return [
            'permanent' => $permanent, 'bonus' => $bonus, 'total' => $permanent + $bonus,
            'level' => $permanent >= 200 ? 4 : ($permanent >= 100 ? 3 : ($permanent >= 50 ? 2 : 1)),
            'awards' => DB::table('awards')->where('profile_id', $profile)->get(),
            'best' => DB::table('best_results')->where('profile_id', $profile)->get(),
            'challenge' => DB::table('challenge_entries')->where('profile_id', $profile)->first(),
            'bonuses' => DB::table('bonuses')->where('profile_id', $profile)->where('expires_at', '>', now())->get(),
            'competencies' => array_map(fn (CompetencySummary $c) => $c->jsonSerialize(), array_values($competencies)),
            'achievements' => $this->achievements($profile),
            'local_demo' => app()->environment('local'),
            'practice_focus' => $practiceFocus,
            'practice_history' => $this->practiceHistory($profile),
            'history' => $history->map(fn ($a) => [
                'id' => $a->id, 'scenario' => $a->scenario, 'mode' => $a->mode,
                'finished_at' => $a->finished_at, 'result' => json_decode($a->result, true),
            ]),
        ];
    }

    /** @return list<array{code:string,title:string,condition:string,earned_at:?string,attempt_id:?string}> */
    private function achievements(string $profile): array
    {
        $earned = DB::table('awards')->where('profile_id', $profile)->get()->keyBy('code');

        return array_map(function (Achievement $definition) use ($earned): array {
            $award = $earned->get($definition->value);

            return ['code' => $definition->value, 'title' => $definition->title(),
                'condition' => $definition->condition(), 'earned_at' => $award ? CarbonImmutable::parse($award->created_at, 'UTC')->toIso8601String() : null,
                'attempt_id' => $award?->attempt_id];
        }, Achievement::cases());
    }

    /** @return list<array{id:string,title:string,passed:bool,finished_at:string}> */
    private function practiceHistory(string $profile): array
    {
        return DB::table('attempts')->where('profile_id', $profile)->whereNotNull('practice_id')
            ->where('status', 'completed')->orderByDesc('finished_at')->limit(30)->get()
            ->map(function (object $row): array {
                $state = AttemptState::restore($row->state);
                $scenario = Scenario::fromJson($state->practice->definition);

                return ['id' => $row->id, 'title' => $scenario->title,
                    'passed' => json_decode($row->result, true, flags: JSON_THROW_ON_ERROR)['passed'],
                    'finished_at' => $row->finished_at];
            })->all();
    }
}
