<?php

declare(strict_types=1);

namespace App\Editor;

use App\Game\AttemptState;
use App\Game\AttemptStatus;
use App\Game\Engine;
use App\Game\Scenario;

/** Checks the supported content contract and explores logical branches without time pressure. */
final class EditorValidator
{
    public const FLAGS = ['seat', 'reported', 'promise', 'owner', 'delayed', 'vague', 'notified', 'warned'];

    public function __construct(private Engine $engine) {}

    public function validate(DraftContent $content, Scenario $baseline): Scenario
    {
        $s = Scenario::fromJson($content->json);
        if ($s->criticalTimeout !== $baseline->criticalTimeout || array_keys($s->initial) !== array_keys($baseline->initial) || $s->rubric !== $baseline->rubric) {
            throw new \InvalidArgumentException('Набор критериев, тип смены и начальные обращения должны соответствовать исходному сценарию.');
        }
        if (count($s->nodes) > 40 || mb_strlen(trim($s->title)) < 1 || mb_strlen($s->title) > 120 || mb_strlen(trim($s->intro)) < 1 || mb_strlen($s->intro) > 2000) {
            throw new \InvalidArgumentException('Нужны название до 120 знаков, условия до 2000 знаков и не более 40 шагов.');
        }
        foreach ($s->nodes as $id => $node) {
            if (! is_string($id) || ! preg_match('/^[a-z][a-z0-9_]{0,63}$/D', $id) || str_starts_with($id, 'closed_') || count($node->actions) > 12 || trim($node->text) === '' || mb_strlen($node->text) > 2000) {
                throw new \InvalidArgumentException('Проверьте шаг «'.$id.'»: текст до 2000 знаков и до 12 действий.');
            }
            foreach ($node->actions as $action) {
                if (! preg_match('/^[a-z][a-z0-9_]{0,63}$/D', $action->id)) {
                    throw new \InvalidArgumentException('В шаге «'.$id.'» неверный идентификатор действия.');
                }
                foreach (['label' => 500, 'explanation' => 2000, 'source' => 500] as $field => $limit) {
                    if (trim($action->$field) === '' || mb_strlen($action->$field) > $limit) {
                        throw new \InvalidArgumentException('В шаге «'.$id.'» заполните реплику, объяснение и источник; текст слишком длинным быть не должен.');
                    }
                }
                if (array_diff(array_keys($action->conditions + $action->flags), self::FLAGS)) {
                    throw new \InvalidArgumentException('В шаге «'.$id.'» указано неизвестное условие.');
                }
                if ($action->open !== null && ($s->id !== 'service' || ! isset($s->nodes[$action->open]))) {
                    throw new \InvalidArgumentException('Новое обращение с багажом должно вести на существующий шаг первой смены.');
                }
            }
        }
        $this->checkPaths($s);

        return $s;
    }

    private function key(AttemptState $state): string
    {
        $flags = $state->flags;
        $threads = $state->threads;
        ksort($flags);
        ksort($threads);

        return hash('sha256', json_encode([$threads, $flags, $state->status, $state->pendingNode], JSON_THROW_ON_ERROR));
    }

    private function checkPaths(Scenario $scenario): void
    {
        $states = [];
        $reverse = [];
        $finished = [];
        $visitedSteps = [];
        foreach ([true, false] as $seat) {
            $state = $scenario->initialState('train', $seat, 1000);
            $states[$this->key($state)] = $state;
        }
        $queue = array_keys($states);
        for ($cursor = 0; $cursor < count($queue); $cursor++) {
            $key = $queue[$cursor];
            $state = $states[$key];
            if ($state->status === AttemptStatus::Completed) {
                $finished[$key] = true;

                continue;
            }
            foreach ($state->threads as $thread => $step) {
                if (! isset($scenario->nodes[$step])) {
                    continue;
                }
                $visitedSteps[$step] = true;
                foreach ($scenario->nodes[$step]->actions as $action) {
                    if (! $scenario->allowed($state, $action)) {
                        continue;
                    }
                    $next = clone $state;
                    $next->events = [];
                    $this->engine->act($next, $scenario, $thread, $action->id, 1000);
                    if ($next->eventAt !== null) {
                        $this->engine->expire($next, $scenario, $next->eventAt);
                    }
                    $nextKey = $this->key($next);
                    $reverse[$nextKey][$key] = true;
                    if (! isset($states[$nextKey])) {
                        $states[$nextKey] = $next;
                        $queue[] = $nextKey;
                    }
                    if (count($states) > 3000) {
                        throw new \InvalidArgumentException('Слишком много сочетаний условий. Упростите ветки сценария.');
                    }
                }
            }
        }
        if (array_diff(array_keys($scenario->nodes), array_keys($visitedSteps))) {
            throw new \InvalidArgumentException('Есть шаги, до которых нельзя добраться. Добавьте переход или удалите лишний шаг.');
        }
        $queue = array_keys($finished);
        for ($i = 0; $i < count($queue); $i++) {
            foreach (array_keys($reverse[$queue[$i]] ?? []) as $key) {
                if (! isset($finished[$key])) {
                    $finished[$key] = true;
                    $queue[] = $key;
                }
            }
        }
        if (count($finished) !== count($states)) {
            throw new \InvalidArgumentException('Есть ветка без доступного завершения. Проверьте условия и переходы между шагами.');
        }
    }
}
