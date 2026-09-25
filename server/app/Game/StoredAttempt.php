<?php

declare(strict_types=1);

namespace App\Game;

final readonly class StoredAttempt
{
    public function __construct(
        public string $id,
        public string $profileId,
        public AttemptState $state,
        public ?string $finishedAt,
    ) {}

    /** @param object{id:string,profile_id:string,state:string,finished_at:?string} $row */
    public static function fromRow(object $row): self
    {
        return new self($row->id, $row->profile_id, AttemptState::restore($row->state), $row->finished_at);
    }
}
