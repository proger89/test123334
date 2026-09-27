import { useState } from "react";
import type { Definition } from "./types";

export function PublicEditorExample({ definition }: { definition: Definition }) {
  const [step, setStep] = useState(Object.keys(definition.nodes)[0]);
  const current = definition.nodes[step];

  return (
    <section className="editor-card editor-example" aria-label="Пример редактора">
      <div className="editor-row">
        <div>
          <p className="eyebrow">Пример для знакомства</p>
          <h2>Как устроен сценарий</h2>
        </div>
        <span className="editor-example-badge">Только просмотр</span>
      </div>
      <p>Выберите шаг и посмотрите, как записаны ситуация, действия и объяснения. Это опубликованная учебная смена; здесь ничего нельзя изменить.</p>
      <div className="editor-example-summary">
        <strong>{definition.title}</strong>
        <p>{definition.intro}</p>
        <small>На решение отведено {definition.seconds} секунд</small>
      </div>
      <div className="editor-workspace">
        <nav className="editor-steps" aria-label="Шаги примера">
          <h3>Шаги сценария</h3>
          {Object.entries(definition.nodes).map(([id, node], index) => (
            <button
              type="button"
              className={step === id ? "active" : ""}
              aria-current={step === id ? "step" : undefined}
              key={id}
              onClick={() => setStep(id)}
            >
              <small>Шаг {index + 1}</small>
              {node.text}
            </button>
          ))}
        </nav>
        <div className="editor-example-detail">
          <h3>Ситуация</h3>
          <p>{current.text}</p>
          <h3>Варианты действий и объяснения</h3>
          {current.actions.map((action) => (
            <article className="editor-example-action" key={action.id}>
              <strong>{action.label}</strong>
              <p>{action.explanation}</p>
              <small>Источник: {action.source}</small>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
