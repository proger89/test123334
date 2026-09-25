<?php

declare(strict_types=1);

namespace App\Editor;

final readonly class EditorDraft implements \JsonSerializable
{
    public function __construct(
        public string $id,
        public string $profileId,
        public string $baseVersion,
        public DraftContent $content,
        public int $revision,
        public ?string $publishedVersion,
    ) {}

    public static function fromRow(object $row): self
    {
        return new self($row->id, $row->profile_id, $row->base_version, DraftContent::parse($row->definition), (int) $row->revision, $row->published_version);
    }

    public function assertEditable(int $revision): void
    {
        if ($this->revision !== $revision) {
            throw new \DomainException('Черновик изменён в другой вкладке. Скопируйте свои изменения или загрузите сохранённую версию.');
        }
        if ($this->publishedVersion !== null) {
            throw new \DomainException('Версия уже опубликована. Создайте новый черновик из неё.');
        }
    }

    public function jsonSerialize(): array
    {
        return ['id' => $this->id, 'base_version' => $this->baseVersion, 'definition' => json_decode($this->content->json, flags: JSON_THROW_ON_ERROR),
            'revision' => $this->revision, 'published_version' => $this->publishedVersion];
    }
}
