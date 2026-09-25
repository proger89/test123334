<?php

declare(strict_types=1);

namespace App\Game;

enum AttemptStatus: string
{
    case Active = 'active';
    case Paused = 'paused';
    case Completed = 'completed';
}
