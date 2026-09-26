<?php

declare(strict_types=1);

namespace App\Game;

enum Achievement: string
{
    case First = 'first';
    case Service = 'service';
    case Security = 'security';
    case Both = 'both';

    public function title(): string
    {
        return match ($this) {
            self::First => 'Первая смена',
            self::Service => 'Верный приоритет',
            self::Security => 'Внимание к обстоятельствам',
            self::Both => 'Две ситуации — два решения',
        };
    }

    public function condition(): string
    {
        return match ($this) {
            self::First => 'Завершите любую смену в обучении или проверке.',
            self::Service => 'Получите зачёт за «Сервис и свободный проход» в проверке. Освободите проход до окончания срока.',
            self::Security => 'Получите зачёт за «Похожая вещь — другое решение» в проверке, не перемещая вещь.',
            self::Both => 'Получите зачёт по обоим сценариям в режиме проверки.',
        };
    }
}
