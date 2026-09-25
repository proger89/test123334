<?php

declare(strict_types=1);

namespace App\Game;

/** Completed assessment shared by the engine and progress policy. */
final readonly class AttemptResult implements \JsonSerializable
{
    /**
     * @param array<string,array{total:int,passed:int,status:string,percent:?int}> $competencies
     * @param array<string,bool> $checks
     * @param array<string,array{label:string,competency:string,default?:bool}> $rubric
     * @param list<array{action:string,explanation:string,source:string,loyalty:int,safety:int}> $events
     */
    public function __construct(
        public int $score,
        public bool $passed,
        public bool $critical,
        public array $competencies,
        public array $checks,
        public array $rubric,
        public array $events,
    ) {}

    public function jsonSerialize(): array
    {
        return get_object_vars($this);
    }
}
