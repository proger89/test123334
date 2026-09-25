<?php

declare(strict_types=1);

namespace App\Practice;

use App\Game\AttemptState;
use App\Game\AttemptStatus;
use App\Game\Scenario;

/** Selects exercises from observed assessment criteria, without model inference. */
final class PracticeCatalog
{
    private const TOPICS = [
        'priority' => ['scenario' => 'service', 'checks' => ['owner', 'location', 'timely'], 'title' => 'Что сделать в первую очередь', 'reason' => 'Потренируйтесь освобождать проход, когда пассажиру тоже нужна помощь.'],
        'communication' => ['scenario' => 'service', 'checks' => ['apology', 'promise', 'polite'], 'title' => 'Помочь без лишних обещаний', 'reason' => 'Потренируйтесь объяснять решение спокойно и обещать только то, что известно.'],
        'unattended' => ['scenario' => 'security', 'checks' => ['touch', 'chief', 'security', 'warn'], 'title' => 'Чья это вещь?', 'reason' => 'Потренируйтесь выбирать действия с учётом того, установлен ли владелец вещи.'],
    ];

    /** @return list<PracticeRecommendation> */
    public function recommendations(AttemptState $state, Scenario $source): array
    {
        if ($state->status !== AttemptStatus::Completed || $state->practice !== null) {
            return [];
        }
        $result = [];
        foreach (self::TOPICS as $id => $topic) {
            if ($topic['scenario'] !== $state->scenario) {
                continue;
            }
            $before = [];
            foreach ($topic['checks'] as $key) {
                if (array_key_exists($key, $state->checks) && ! $state->checks[$key]) {
                    $before[] = 'Не выполнен пункт: '.$source->rubric[$key]['label'].'.';
                }
            }
            if ($id === 'unattended' && $state->timedOut) {
                $before[] = 'Сообщение не передано до окончания учебного срока.';
            }
            if ($before !== []) {
                $result[] = new PracticeRecommendation($id, $topic['title'], $topic['reason'], $before);
            }
        }

        return $result;
    }

    public function definition(string $id): string
    {
        if (! array_key_exists($id, self::TOPICS)) {
            throw new \DomainException('Такого упражнения нет.');
        }
        $json = file_get_contents(__DIR__.'/../../resources/practice/'.$id.'.json');
        Scenario::fromJson($json);

        return $json;
    }

    public function exerciseForCheck(string $scenario, string $check): ?string
    {
        foreach (self::TOPICS as $id => $topic) {
            if ($topic['scenario'] === $scenario && in_array($check, $topic['checks'], true)) {
                return $id;
            }
        }

        return null;
    }
}
