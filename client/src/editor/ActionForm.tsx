import { flags, type Action, type Definition } from "./types";
function Choices({
  label,
  labels,
  value,
  onChange,
}: {
  label: string;
  labels: Record<string, string>;
  value: Record<string, boolean>;
  onChange: (value: Record<string, boolean>) => void;
}) {
  return (
    <fieldset className="editor-choices">
      <legend>{label}</legend>
      {Object.entries(labels).map(([id, text]) => (
        <label key={id}>
          {text}
          <select
            value={id in value ? String(value[id]) : ""}
            onChange={(e) => {
              const next = { ...value };
              if (e.target.value === "") delete next[id];
              else next[id] = e.target.value === "true";
              onChange(next);
            }}
          >
            <option value="">Не задавать</option>
            <option value="true">Да</option>
            <option value="false">Нет</option>
          </select>
        </label>
      ))}
    </fieldset>
  );
}
export function ActionForm({
  action,
  definition,
  index,
  onChange,
  onRemove,
}: {
  action: Action;
  definition: Definition;
  index: number;
  onChange: (a: Action) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<Action>) => onChange({ ...action, ...patch });
  const target = (key: "next" | "open", value: string) => {
    const a = { ...action };
    if (value) a[key] = value;
    else delete a[key];
    onChange(a);
  };
  return (
    <section className="editor-action" aria-label={"Действие " + (index + 1)}>
      <div className="editor-row">
        <h3>Действие {index + 1}</h3>
        <button type="button" onClick={onRemove}>
          Удалить действие
        </button>
      </div>
      <label>
        Текст кнопки
        <textarea
          value={action.label}
          maxLength={500}
          onChange={(e) => set({ label: e.target.value })}
        />
      </label>
      <label>
        Что произойдёт после выбора
        <select
          value={action.next ?? ""}
          onChange={(e) => target("next", e.target.value)}
        >
          <option value="">Остаться на этом шаге</option>
          <option value="closed_resolved">Завершить обращение: решено</option>
          <option value="closed_unresolved">
            Завершить обращение: не решено
          </option>
          {Object.entries(definition.nodes).map(([id, n]) => (
            <option key={id} value={id}>
              {id} · {n.text.slice(0, 65) || "Новый шаг"}
            </option>
          ))}
        </select>
      </label>
      <div className="editor-columns">
        <label>
          Изменение лояльности
          <input
            type="number"
            min={-100}
            max={100}
            value={action.loyalty ?? 0}
            onChange={(e) => set({ loyalty: Number(e.target.value) })}
          />
        </label>
        <label>
          Изменение безопасности
          <input
            type="number"
            min={-100}
            max={100}
            value={action.safety ?? 0}
            onChange={(e) => set({ safety: Number(e.target.value) })}
          />
        </label>
      </div>
      <label>
        Объяснение для сотрудника
        <textarea
          value={action.explanation}
          maxLength={2000}
          onChange={(e) => set({ explanation: e.target.value })}
        />
      </label>
      <label>
        Источник: документ и пункт
        <input
          value={action.source}
          maxLength={500}
          onChange={(e) => set({ source: e.target.value })}
        />
      </label>
      <details>
        <summary>Условия появления и последствия</summary>
        <p>
          «Не задавать» оставляет признак или критерий без изменений. Для
          условий это означает, что признак не проверяется.
        </p>
        <Choices
          label="Показывать действие, когда"
          labels={flags}
          value={action.when ?? {}}
          onChange={(when) => set({ when })}
        />
        <Choices
          label="После выбора установить"
          labels={flags}
          value={action.flags ?? {}}
          onChange={(value) => set({ flags: value })}
        />
        <Choices
          label="Критерии выполнены"
          labels={Object.fromEntries(
            Object.entries(definition.rubric).map(([id, r]) => [id, r.label]),
          )}
          value={action.checks ?? {}}
          onChange={(checks) => set({ checks })}
        />
        {definition.id === "service" && (
          <label>
            Через 20 секунд создать обращение о багаже
            <select
              value={action.open ?? ""}
              onChange={(e) => target("open", e.target.value)}
            >
              <option value="">Не создавать</option>
              {Object.entries(definition.nodes).map(([id, n]) => (
                <option key={id} value={id}>
                  {id} · {n.text.slice(0, 65)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="editor-check">
          <input
            type="checkbox"
            checked={action.close_timer ?? false}
            onChange={(e) => set({ close_timer: e.target.checked })}
          />
          Остановить срок обращения
        </label>
        <label className="editor-check">
          <input
            type="checkbox"
            checked={action.critical ?? false}
            onChange={(e) => set({ critical: e.target.checked })}
          />
          Критическая ошибка: завершить смену незачётом
        </label>
      </details>
    </section>
  );
}
