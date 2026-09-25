<?php

declare(strict_types=1);

namespace App\Game;

final class Engine
{
    public function execute(AttemptState $s, Scenario $scenario, AttemptCommand $command, float $time): void
    {
        if ($command->revision !== $s->revision) {
            throw new \DomainException('Ситуация изменилась. Выберите действие ещё раз.');
        }
        if ($s->status === AttemptStatus::Completed) {
            throw new \DomainException('Попытка завершена');
        }
        if ($command->kind === CommandKind::Action) {
            $this->act($s, $scenario, $command->threadId, $command->actionId, $time);
        } elseif ($command->kind === CommandKind::Pause) {
            if ($s->mode !== 'train') {
                throw new \DomainException('Проверку нельзя приостановить');
            }
            if ($command->paused && $s->status === AttemptStatus::Active) {
                $s->remaining = $s->deadline === null ? null : max(0, $s->deadline - $time);
                $s->deadline = null;
                $s->eventRemaining = $s->eventAt === null ? null : max(0, $s->eventAt - $time);
                $s->eventAt = null;
                $s->status = AttemptStatus::Paused;
                $s->revision++;
            } elseif (! $command->paused && $s->status === AttemptStatus::Paused) {
                $s->deadline = $s->remaining === null ? null : $time + $s->remaining;
                $s->remaining = null;
                $s->eventAt = $s->eventRemaining === null ? null : $time + $s->eventRemaining;
                $s->eventRemaining = null;
                $s->status = AttemptStatus::Active;
                $s->revision++;
            }
        } elseif ($command->kind === CommandKind::Finish) {
            $s->status = AttemptStatus::Completed;
            $s->reason = 'user_exit';
            $s->revision++;
        }
    }

    public function expire(AttemptState $s, Scenario $scenario, float $now): void
    {
        if ($s->status === AttemptStatus::Active && $s->eventAt !== null && $now >= $s->eventAt) {
            $s->threads['baggage'] = $s->pendingNode;
            $s->deadline = $s->eventAt + $scenario->seconds;
            $s->eventAt = null;
            $s->pendingNode = null;
            $s->revision++;
            $s->events[] = ['action' => 'Новое обращение: багаж в проходе', 'explanation' => 'В проходе стоит чемодан. Нужно попросить владельца убрать его в отведённое время.', 'source' => 'Ситуации на борту, №14', 'loyalty' => $s->loyalty, 'safety' => $s->safety];
        }
        if ($s->status !== AttemptStatus::Active || $s->deadline === null || $now < $s->deadline) {
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
            $s->status = AttemptStatus::Completed;
            $s->reason = 'critical_timeout';
        }
    }

    public function act(AttemptState $s, Scenario $scenario, string $thread, string $id, float $now): void
    {
        if ($s->status !== AttemptStatus::Active) {
            throw new \DomainException('Попытка не активна');
        }
        $node = $scenario->nodes[$s->threads[$thread] ?? ''] ?? null;
        $action = null;
        foreach ($node?->actions ?? [] as $candidate) {
            if ($candidate->id === $id && $scenario->allowed($s, $candidate)) {
                $action = $candidate;
            }
        }
        if (! $action) {
            throw new \DomainException('Действие недоступно');
        }
        $s->loyalty = max(0, min(100, $s->loyalty + ($action->loyalty ?? 0)));
        $s->safety = max(0, min(100, $s->safety + ($action->safety ?? 0)));
        foreach ($action->flags ?? [] as $key => $value) {
            $s->flags[$key] = $value;
        }
        foreach ($action->checks ?? [] as $key => $value) {
            $s->checks[$key] = $value;
        }
        if (isset($action->next)) {
            $s->threads[$thread] = $action->next;
        }
        if (isset($action->open) && ! isset($s->threads['baggage']) && $s->pendingNode === null) {
            $s->pendingNode = $action->open;
            $s->eventAt = $now + 20;
        }
        if ($action->closeTimer ?? false) {
            $s->deadline = null;
            if (isset($s->checks['timely'])) {
                $s->checks['timely'] = ! $s->timedOut;
            }
        }
        if ($action->critical ?? false) {
            $s->critical = true;
            $s->status = AttemptStatus::Completed;
            $s->reason = 'critical_action';
        }
        $s->events[] = ['action' => $action->label, 'explanation' => $action->explanation, 'source' => $action->source, 'loyalty' => $s->loyalty, 'safety' => $s->safety];
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
        $s->status = AttemptStatus::Completed;
        $s->reason = in_array('closed_unresolved', $s->threads, true) ? 'user_exit' : 'resolved';
        if ($s->flags['promise']) {
            $s->loyalty = max(0, $s->loyalty - 10);
            $s->flags['promise'] = false;
            $s->events[] = ['action' => 'Обещанный ремонт не подтверждён', 'explanation' => 'Пассажир рассчитывал на обещанное решение. Обещайте только то, что можете подтвердить. Лояльность снизилась на 10 баллов.', 'source' => 'Ситуации на борту, №16', 'loyalty' => $s->loyalty, 'safety' => $s->safety];
        }
    }

    public function result(AttemptState $s, Scenario $scenario): AttemptResult
    {
        $score = (int) round(100 * count(array_filter($s->checks)) / count($scenario->rubric));
        $passed = $s->status === AttemptStatus::Completed && $s->reason === 'resolved' && ! $s->critical && $s->safety >= 80 && $score >= 70;
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

        return new AttemptResult($score, $passed, $s->critical, $competencies, $s->checks, $scenario->rubric, $s->events);
    }

    public function view(AttemptState $s, Scenario $scenario): array
    {
        $threads = [];
        foreach ($s->threads as $thread => $node) {
            $n = $scenario->nodes[$node] ?? new ScenarioStep('Обращение завершено', []);
            $actions = [];
            foreach ($n->actions as $a) {
                if ($scenario->allowed($s, $a)) {
                    $actions[] = ['id' => $a->id, 'label' => $a->label];
                }
            }
            $threads[] = ['id' => $thread, 'text' => $n->text, 'closed' => str_starts_with($node, 'closed_'), 'actions' => $actions];
        }

        return ['status' => $s->status->value, 'mode' => $s->mode, 'revision' => $s->revision, 'loyalty' => $s->loyalty, 'safety' => $s->safety, 'deadline' => $s->deadline, 'remaining' => $s->remaining, 'threads' => $threads, 'title' => $scenario->title, 'result' => $s->status === AttemptStatus::Completed ? $this->result($s, $scenario)->jsonSerialize() : null];
    }
}
