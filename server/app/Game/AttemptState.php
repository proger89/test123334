<?php

declare(strict_types=1);

namespace App\Game;

final class AttemptState
{
    public AttemptStatus $status = AttemptStatus::Active;

    public int $revision = 0;

    public int $loyalty = 60;

    public int $safety = 80;

    public array $flags = [];

    public array $checks = [];

    public array $threads = [];

    public array $events = [];

    public ?float $deadline = null;

    public ?float $remaining = null;

    public ?float $eventAt = null;

    public ?float $eventRemaining = null;

    public ?string $pendingNode = null;

    public bool $critical = false;

    public bool $timedOut = false;

    public ?string $reason = null;

    public function __construct(public string $mode, public string $scenario, public string $version) {}

    public static function restore(string $json): self
    {
        $data = json_decode($json, true, flags: JSON_THROW_ON_ERROR);
        $state = new self($data['mode'], $data['scenario'], $data['version']);
        foreach ($data as $key => $value) {
            if ($key === 'status') {
                $state->status = AttemptStatus::from($value);

                continue;
            }
            if (property_exists($state, $key)) {
                $state->$key = $value;
            }
        }

        return $state;
    }

    public function json(): string
    {
        return json_encode($this, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
    }
}
