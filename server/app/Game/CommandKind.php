<?php

declare(strict_types=1);

namespace App\Game;

enum CommandKind: string
{
    case Action = 'actions';
    case Pause = 'pause';
    case Finish = 'finish';
}
