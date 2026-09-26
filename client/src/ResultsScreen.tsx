import { competencyName } from "./ProgressDetails";
import { AlertTriangle, CheckCircle } from "lucide-react";
import type { Attempt, Result } from "./api";
import { PracticeOptions } from "./PracticeScreen";

type Props = {
  attempt: Attempt;
  result: Result;
  busy: boolean;
  startPractice: (exercise: string) => void;
  repeat: () => void;
  openProgress: () => void;
  openScenarios: () => void;
};

export function ResultsScreen({
  attempt,
  result,
  busy,
  startPractice,
  repeat,
  openProgress,
  openScenarios,
}: Props) {
  const criteria = Object.entries(result.rubric);
  const completed = criteria.filter(([id]) => result.checks[id]);
  const remaining = criteria.filter(([id]) => !result.checks[id]);
  return (
    <section className="results shift-results">
      <p className="eyebrow">
        Разбор смены · {attempt.mode === "train" ? "Обучение" : "Проверка"}
      </p>
      <h1>{result.passed ? "Смена пройдена" : "Есть что отработать"}</h1>
      <div className="result-score">
        {result.passed ? (
          <CheckCircle className="green" />
        ) : (
          <AlertTriangle className="orange" />
        )}
        <b>{result.score}/100</b>
        <div>
          <strong>{result.passed ? "Зачёт" : "Незачёт"}</strong>
          {result.critical && (
            <p className="critical-result">Критическая ошибка</p>
          )}
          <p className="result-caption">
            Выполнено {completed.length} из {criteria.length} пунктов
          </p>
        </div>
      </div>
      <p className="result-caption">
        {attempt.mode === "train"
          ? "Учебная попытка. Баллы в рейтинг не начисляются."
          : "В рейтинг входит лучший зачтённый результат этой смены."}
      </p>

      <div className="result-review">
        <section
          className="review-group review-success"
          aria-labelledby="completed-heading"
        >
          <h2 id="completed-heading">
            <CheckCircle aria-hidden="true" />
            Что получилось <span>{completed.length}</span>
          </h2>
          {completed.length ? (
            <ul>
              {completed.map(([id, criterion]) => (
                <li key={id}>{criterion.label}</li>
              ))}
            </ul>
          ) : (
            <p>В этой попытке пока нет выполненных пунктов.</p>
          )}
        </section>
        {remaining.length > 0 && (
          <section
            className="review-group review-repeat"
            aria-labelledby="remaining-heading"
          >
            <h2 id="remaining-heading">
              <AlertTriangle aria-hidden="true" />
              Что стоит повторить <span>{remaining.length}</span>
            </h2>
            <ul>
              {remaining.map(([id, criterion]) => (
                <li key={id}>{criterion.label}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <PracticeOptions
        options={attempt.practice_options || []}
        busy={busy}
        start={startPractice}
      />

      <details className="result-details">
        <summary>Оценка по навыкам</summary>
        <div className="competency-row">
          {Object.entries(result.competencies).map(([name, competency]) => (
            <div key={name}>
              <strong>{competencyName(name)}</strong>
              <p>
                {competency.percent === null
                  ? "Допущена критическая ошибка"
                  : competency.percent + "%"}
              </p>
            </div>
          ))}
        </div>
      </details>
      <details className="result-details">
        <summary>
          Решения и последствия <span>{result.events.length}</span>
        </summary>
        {result.events.map((event, index) => (
          <article className="event" key={index}>
            <span>{index + 1}</span>
            <div>
              <h3>{event.action}</h3>
              <p>{event.explanation}</p>
              <small>
                <a
                  href={
                    "/sources/situations.pdf#page=" +
                    (event.source.includes("41")
                      ? 16
                      : event.source.includes("14")
                        ? 7
                        : 8)
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  {event.source}
                </a>{" "}
                · Лояльность {event.loyalty} · Безопасность {event.safety}
              </small>
            </div>
          </article>
        ))}
      </details>
      <div className="game-tools">
        <button
          disabled={busy}
          className={attempt.practice_options?.length ? "" : "primary"}
          onClick={repeat}
        >
          Повторить обучение
        </button>
        <button onClick={openProgress}>Мой прогресс</button>
        <button onClick={openScenarios}>Другие сценарии</button>
      </div>
      <p className="footnote">
        Результат учебной модели не является оценкой профессиональной
        пригодности. Полный алгоритм транспортной безопасности требует уточнения
        у заказчика.
      </p>
    </section>
  );
}
