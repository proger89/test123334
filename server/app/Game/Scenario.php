<?php

declare(strict_types=1);

namespace App\Game;

final readonly class Scenario
{
    public function __construct(public string $id, public string $version, public string $title, public string $intro, public array $nodes, public array $rubric, public array $initial, public int $seconds, public bool $criticalTimeout) {}

    public static function fromJson(string $json): self
    {
        $d = json_decode($json, true, flags: JSON_THROW_ON_ERROR);

        return new self($d['id'], $d['version'], $d['title'], $d['intro'], $d['nodes'], $d['rubric'], $d['initial'], $d['seconds'], $d['critical_timeout']);
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

    public function allowed(AttemptState $s, array $action): bool
    {
        foreach ($action['when'] ?? [] as $key => $value) {
            if (($s->flags[$key] ?? false) !== $value) {
                return false;
            }
        }

        return true;
    }
}
