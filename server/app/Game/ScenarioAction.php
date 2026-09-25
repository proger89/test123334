<?php

declare(strict_types=1);

namespace App\Game;

/** An action owns only the finite effects supported by the training engine. */
final readonly class ScenarioAction
{
    /** @param array<string,bool> $conditions @param array<string,bool> $flags @param array<string,bool> $checks */
    public function __construct(
        public string $id,
        public string $label,
        public string $explanation,
        public string $source,
        public int $loyalty = 0,
        public int $safety = 0,
        public array $conditions = [],
        public array $flags = [],
        public array $checks = [],
        public ?string $next = null,
        public ?string $open = null,
        public bool $closeTimer = false,
        public bool $critical = false,
    ) {}

    /** @param array{id:string,label:string,explanation:string,source:string,loyalty?:int,safety?:int,when?:array<string,bool>,flags?:array<string,bool>,checks?:array<string,bool>,next?:string,open?:string,close_timer?:bool,critical?:bool} $data */
    public static function fromArray(array $data): self
    {
        return new self($data['id'], $data['label'], $data['explanation'], $data['source'],
            $data['loyalty'] ?? 0, $data['safety'] ?? 0, $data['when'] ?? [],
            $data['flags'] ?? [], $data['checks'] ?? [], $data['next'] ?? null,
            $data['open'] ?? null, $data['close_timer'] ?? false, $data['critical'] ?? false);
    }
}
