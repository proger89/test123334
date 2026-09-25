<?php

declare(strict_types=1);

namespace App\Game;

final readonly class AttemptCommand
{
    public function __construct(
        public CommandKind $kind,
        public string $requestId,
        public int $revision,
        public ?string $threadId,
        public ?string $actionId,
        public ?bool $paused,
    ) {
        if ($kind === CommandKind::Action && (! $threadId || ! $actionId)) {
            throw new \InvalidArgumentException('Для действия нужны обращение и вариант ответа');
        }
        if ($kind === CommandKind::Pause && $paused === null) {
            throw new \InvalidArgumentException('Для паузы нужно явное состояние');
        }
    }

    /** @param array{request_id:string,expected_revision:int,thread_id?:string,action_id?:string,paused?:bool} $input */
    public static function fromArray(string $operation, array $input): self
    {
        return new self(CommandKind::from($operation), $input['request_id'], (int) $input['expected_revision'],
            $input['thread_id'] ?? null, $input['action_id'] ?? null, isset($input['paused']) ? (bool) $input['paused'] : null);
    }

    public function fingerprint(string $attempt): string
    {
        $input = ['request_id' => $this->requestId, 'expected_revision' => $this->revision];
        if ($this->kind === CommandKind::Action) {
            $input += ['thread_id' => $this->threadId, 'action_id' => $this->actionId];
        } elseif ($this->kind === CommandKind::Pause) {
            $input['paused'] = $this->paused;
        }
        ksort($input);

        return hash('sha256', $attempt.$this->kind->value.json_encode($input, JSON_THROW_ON_ERROR));
    }
}
