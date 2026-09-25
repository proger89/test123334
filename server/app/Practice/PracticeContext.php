<?php

declare(strict_types=1);

namespace App\Practice;

/** Frozen exercise and source evidence; never sent to the browser in full. */
final readonly class PracticeContext
{
    /** @param list<string> $before */
    public function __construct(
        public string $id,
        public string $sourceAttemptId,
        public string $definition,
        public array $before,
    ) {}

    /** @param array{id:string,sourceAttemptId:string,definition:string,before:list<string>} $data */
    public static function restore(array $data): self
    {
        return new self($data['id'], $data['sourceAttemptId'], $data['definition'], $data['before']);
    }
}
