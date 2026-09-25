<?php

declare(strict_types=1);

namespace App\Practice;

final class PracticeFocus implements \JsonSerializable
{
    public int $misses = 0;

    public int $observations = 0;

    public ?string $source_attempt_id = null;

    public function __construct(
        public readonly string $label,
        public readonly string $scenario,
        public readonly string $version,
        public readonly string $mode,
        public readonly ?string $exercise_id,
    ) {}

    public function jsonSerialize(): array
    {
        return get_object_vars($this);
    }
}
