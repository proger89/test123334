<?php

declare(strict_types=1);

namespace App\Game;

/** A window of observations, with the newest attempt kept separate. */
final class CompetencySummary implements \JsonSerializable
{
    public int $total = 0;

    public int $passed = 0;

    public bool $critical = false;

    public int $critical_attempts = 0;

    public int $attempts = 0;

    public function __construct(
        public readonly string $scenario,
        public readonly string $version,
        public readonly string $mode,
        public readonly string $name,
        public readonly string $latest_attempt_id,
        public readonly string $latest_finished_at,
        public readonly ?int $latest_percent,
        public readonly bool $latest_critical,
        public readonly int $latest_passed,
        public readonly int $latest_total,
    ) {}

    public function observe(int $passed, int $total, bool $critical): void
    {
        $this->passed += $passed;
        $this->total += $total;
        $this->critical = $this->critical || $critical;
        $this->critical_attempts += (int) $critical;
        $this->attempts++;
    }

    public function jsonSerialize(): array
    {
        return get_object_vars($this) + ['percent' => $this->critical || ! $this->total ? null : (int) round(100 * $this->passed / $this->total)];
    }
}
