<?php

declare(strict_types=1);

namespace App\Practice;

final readonly class PracticeRecommendation implements \JsonSerializable
{
    /** @param list<string> $before */
    public function __construct(
        public string $id,
        public string $title,
        public string $reason,
        public array $before,
    ) {}

    public function jsonSerialize(): array
    {
        return get_object_vars($this);
    }
}
