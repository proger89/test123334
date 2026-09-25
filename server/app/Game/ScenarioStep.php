<?php

declare(strict_types=1);

namespace App\Game;

final readonly class ScenarioStep
{
    /** @param list<ScenarioAction> $actions */
    public function __construct(public string $text, public array $actions) {}
}
