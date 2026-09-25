<?php

declare(strict_types=1);

namespace App\Game;

final class Engine
{
    public function expire(AttemptState $s, Scenario $scenario, float $now): void
    {
        if ($s->status === 'active' && $s->eventAt !== null && $now >= $s->eventAt) {
            $s->threads['baggage'] = $s->pendingNode;
            $s->deadline = $s->eventAt + $scenario->seconds;
            $s->eventAt = null;
            $s->pendingNode = null;
            $s->revision++;
            $s->events[] = ['action' => 'Новое обращение: багаж в проходе', 'explanation' => 'Появилось независимое обращение. Срок освобождения прохода уже идёт.', 'source' => 'Ситуации на борту, №14', 'loyalty' => $s->loyalty, 'safety' => $s->safety];
        }
        if ($s->status !== 'active' || $s->deadline === null || $now < $s->deadline) {
            return;
        }
        $s->deadline = null;
        $s->timedOut = true;
        $s->revision++;
        $s->safety = max(0, $s->safety - ($scenario->criticalTimeout ? 30 : 25));
        if (! $scenario->criticalTimeout) {
            $s->loyalty = max(0, $s->loyalty - 5);
        }
        $s->events[] = ['action' => 'Время истекло', 'explanation' => 'Учебный срок реакции пропущен. Секунды заданы авторами тренажёра, а не нормативом перевозчика.', 'source' => $scenario->criticalTimeout ? 'Ситуации на борту, №41' : 'Ситуации на борту, №14', 'loyalty' => $s->loyalty, 'safety' => $s->safety];
        if ($scenario->criticalTimeout) {
            $s->critical = true;
            $s->status = 'completed';
            $s->reason = 'critical_timeout';
        }
    }

    public function act(AttemptState $s, Scenario $scenario, string $thread, string $id, float $now): void
    {
        if ($s->status !== 'active') {
            throw new \DomainException('Попытка не активна');
        }
        $node = $scenario->nodes[$s->threads[$thread] ?? ''] ?? null;
        $action = null;
        foreach ($node['actions'] ?? [] as $candidate) {
            if ($candidate['id'] === $id && $scenario->allowed($s, $candidate)) {
                $action = $candidate;
            }
        }
        if (! $action) {
            throw new \DomainException('Действие недоступно');
        }
        $s->loyalty = max(0, min(100, $s->loyalty + ($action['loyalty'] ?? 0)));
        $s->safety = max(0, min(100, $s->safety + ($action['safety'] ?? 0)));
        foreach ($action['flags'] ?? [] as $key => $value) {
            $s->flags[$key] = $value;
        }
        foreach ($action['checks'] ?? [] as $key => $value) {
            $s->checks[$key] = $value;
        }
        if (isset($action['next'])) {
            $s->threads[$thread] = $action['next'];
        }
        if (isset($action['open']) && ! isset($s->threads['baggage']) && $s->pendingNode === null) {
            $s->pendingNode = $action['open'];
            $s->eventAt = $now + 20;
        }
        if ($action['close_timer'] ?? false) {
            $s->deadline = null;
            if (isset($s->checks['timely'])) {
                $s->checks['timely'] = ! $s->timedOut;
            }
        }
        if ($action['critical'] ?? false) {
            $s->critical = true;
            $s->status = 'completed';
            $s->reason = 'critical_action';
        }
        $s->events[] = ['action' => $action['label'], 'explanation' => $action['explanation'], 'source' => $action['source'], 'loyalty' => $s->loyalty, 'safety' => $s->safety];
        $s->revision++;
        $this->finishIfResolved($s);
    }

    private function finishIfResolved(AttemptState $s): void
    {
        if ($s->pendingNode !== null) {
            return;
        }
        foreach ($s->threads as $node) {
            if (! str_starts_with($node, 'closed_')) {
                return;
            }
        }
        $s->status = 'completed';
        $s->reason = in_array('closed_unresolved', $s->threads, true) ? 'user_exit' : 'resolved';
        if ($s->flags['promise']) {
            $s->loyalty = max(0, $s->loyalty - 10);
            $s->flags['promise'] = false;
        }
    }

    public function result(AttemptState $s, Scenario $scenario): array
    {
        $score = (int) round(100 * count(array_filter($s->checks)) / count($scenario->rubric));
        $passed = $s->status === 'completed' && $s->reason === 'resolved' && ! $s->critical && $s->safety >= 80 && $score >= 70;
        $competencies = [];
        foreach ($scenario->rubric as $id => $check) {
            $c = $check['competency'];
            $competencies[$c]['total'] = ($competencies[$c]['total'] ?? 0) + 1;
            $competencies[$c]['passed'] = ($competencies[$c]['passed'] ?? 0) + (int) $s->checks[$id];
        }
        foreach ($competencies as $name => &$c) {
            $c['status'] = $s->critical && $name === 'Безопасность' ? 'critical_failure' : 'observed';
            $c['percent'] = $c['status'] === 'critical_failure' ? null : (int) round(100 * $c['passed'] / $c['total']);
        }

        return ['score' => $score, 'passed' => $passed, 'competencies' => $competencies, 'checks' => $s->checks, 'rubric' => $scenario->rubric, 'events' => $s->events, 'critical' => $s->critical];
    }

    public function view(AttemptState $s, Scenario $scenario): array
    {
        $threads = [];
        foreach ($s->threads as $thread => $node) {
            $n = $scenario->nodes[$node] ?? ['text' => 'Обращение завершено', 'actions' => []];
            $actions = [];
            foreach ($n['actions'] as $a) {
                if ($scenario->allowed($s, $a)) {
                    $actions[] = ['id' => $a['id'], 'label' => $a['label']];
                }
            }$threads[] = ['id' => $thread, 'text' => $n['text'], 'closed' => str_starts_with($node, 'closed_'), 'actions' => $actions];
        }

        return ['status' => $s->status, 'mode' => $s->mode, 'revision' => $s->revision, 'loyalty' => $s->loyalty, 'safety' => $s->safety, 'deadline' => $s->deadline, 'remaining' => $s->remaining, 'threads' => $threads, 'title' => $scenario->title, 'result' => $s->status === 'completed' ? $this->result($s, $scenario) : null];
    }
}
