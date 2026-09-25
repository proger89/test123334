<?php

declare(strict_types=1);

namespace App\Editor;

use Opis\JsonSchema\Validator;

/** Preserves JSON objects, including empty condition maps, across the HTTP boundary. */
final readonly class DraftContent
{
    private function __construct(public string $json, public string $scenario) {}

    public static function parse(string $json): self
    {
        if (strlen($json) > 150000) {
            throw new \InvalidArgumentException('Сценарий слишком большой: предел 150 КБ.');
        }
        try {
            $data = json_decode($json, flags: JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new \InvalidArgumentException('Не удалось прочитать содержание сценария.');
        }
        if (! $data instanceof \stdClass || ! in_array($data->id ?? null, ['service', 'security'], true)) {
            throw new \InvalidArgumentException('Выберите один из двух поддерживаемых сценариев.');
        }

        $schema = json_decode(file_get_contents(__DIR__.'/../../resources/contracts/scenario.schema.json'));
        self::allowIncompleteContent($schema);
        if (! (new Validator)->validate($data, $schema)->isValid()) {
            throw new \InvalidArgumentException('Структура черновика повреждена. Сохраните шаги и действия в предусмотренных полях.');
        }

        return new self($json, $data->id);
    }

    private static function allowIncompleteContent(object $schema): void
    {
        unset($schema->minLength, $schema->minimum, $schema->maximum, $schema->minItems);
        foreach ($schema as $value) {
            if (is_object($value)) {
                self::allowIncompleteContent($value);
            }
        }
    }

    public function withVersion(string $version): self
    {
        $data = json_decode($this->json, flags: JSON_THROW_ON_ERROR);
        $data->version = $version;

        return self::parse(json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
    }
}
