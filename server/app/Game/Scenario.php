<?php

declare(strict_types=1);

namespace App\Game;

use Opis\JsonSchema\Errors\ErrorFormatter;
use Opis\JsonSchema\Validator;

final readonly class Scenario
{
    public function __construct(public string $id, public string $version, public string $title, public string $intro, public array $nodes, public array $rubric, public array $initial, public int $seconds, public bool $criticalTimeout) {}

    public static function fromJson(string $json): self
    {
        $validator = new Validator;
        $schema = json_decode(file_get_contents(__DIR__.'/../../resources/contracts/scenario.schema.json'));
        $validation = $validator->validate(json_decode($json, flags: JSON_THROW_ON_ERROR), $schema);
        if (! $validation->isValid()) {
            throw new \InvalidArgumentException('Сценарий не соответствует JSON Schema: '.json_encode((new ErrorFormatter)->format($validation->error()), JSON_UNESCAPED_UNICODE));
        }
        $d = json_decode($json, true, flags: JSON_THROW_ON_ERROR);
        $nodes = [];
        foreach ($d['nodes'] as $id => $node) {
            $actions = array_map(ScenarioAction::fromArray(...), $node['actions']);
            if (count(array_unique(array_column($node['actions'], 'id'))) !== count($actions)) {
                throw new \InvalidArgumentException('Повтор действия в шаге '.$id);
            }
            foreach ($actions as $action) {
                foreach (array_filter([$action->next, $action->open]) as $target) {
                    if (! isset($d['nodes'][$target]) && ! in_array($target, ['closed_resolved', 'closed_unresolved'], true)) {
                        throw new \InvalidArgumentException('Неизвестный шаг '.$target);
                    }
                }
                if (array_diff(array_keys($action->checks), array_keys($d['rubric']))) {
                    throw new \InvalidArgumentException('Неизвестный пункт оценки');
                }
            }
            $nodes[$id] = new ScenarioStep($node['text'], $actions);
        }
        foreach ($d['initial'] as $node) {
            if (! isset($nodes[$node])) {
                throw new \InvalidArgumentException('Неизвестный начальный шаг');
            }
        }

        return new self($d['id'], $d['version'], $d['title'], $d['intro'], $nodes, $d['rubric'], $d['initial'], $d['seconds'], $d['critical_timeout']);
    }

    public function initialState(string $mode, bool $seat, float $now): AttemptState
    {
        $s = new AttemptState($mode, $this->id, $this->version);
        $s->threads = $this->initial;
        $s->flags = ['seat' => $seat, 'reported' => false, 'promise' => false, 'owner' => false];
        foreach ($this->rubric as $key => $check) {
            $s->checks[$key] = $check['default'] ?? false;
        }
        if ($this->criticalTimeout) {
            $s->deadline = $now + $this->seconds;
        }

        return $s;
    }

    public function allowed(AttemptState $s, ScenarioAction $action): bool
    {
        foreach ($action->conditions as $key => $value) {
            if (($s->flags[$key] ?? false) !== $value) {
                return false;
            }
        }

        return true;
    }
}
