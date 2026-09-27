import { competencyName } from "./ProgressDetails";
import { AlertTriangle, CheckCircle } from "lucide-react";
import type { Attempt, Progress, Result } from "./api";
import { PracticeOptions } from "./PracticeScreen";

type Props = {
  attempt: Attempt;
  result: Result;
  progress: Progress | null;
  busy: boolean;
  startPractice: (exercise: string) => void;
  repeat: () => void;
  openProgress: () => void;
  openScenarios: () => void;
};

export function ResultsScreen({
  attempt,
  result,
  progress,
  busy,
  startPractice,
  repeat,
  openProgress,
  openScenarios,
}: Props) {
  const criteria = Object.entries(result.rubric);
  const completed = criteria.filter(([id]) => result.checks[id]);
  const remaining = criteria.filter(([id]) => !result.checks[id]);
  const bestScore = progress?.best.find(
    (best) => best.scenario === attempt.scenario,
  )?.score;
  return (
    <section className="results shift-results">
      <p className="eyebrow">
        Разбор смены · {attempt.mode === "train" ? "Обучение" : "Проверка"}
      </p>
      <h1>{result.passed ? "Смена пройдена" : "Есть что отработать"}</h1>
      {attempt.scenario === "security" &&
        attempt.version === "1" &&
        result.passed && (
          <div className="completion-note" role="status">
            <strong>Обращение завершено автоматически.</strong>
            <p>{attempt.last_decision?.explanation}</p>
          </div>
        )}
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
          : result.passed
            ? "В рейтинг входит лучший зачтённый результат этой смены."
            : "Незачёт не добавляет основных баллов."}
      </p>
      {attempt.mode === "check" &&
        result.passed &&
        progress &&
        bestScore !== undefined &&
        bestScore >= result.score && (
          <div className="ranked-result" role="status">
            <strong>
              Основные баллы: {progress.permanent} · Уровень {progress.level}
            </strong>
            <p>
              Лучший зачёт в этой ситуации: {bestScore}/100.
              {bestScore > result.score &&
                ` Эта попытка набрала ${result.score}/100, поэтому уже полученные баллы не уменьшились.`}
            </p>
          </div>
        )}

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

      <section className="result-evaluation" aria-labelledby="evaluation-heading">
        <h2 id="evaluation-heading">Как складывается результат</h2>
        <p>
          Оценка {result.score}/100 — это {completed.length} выполненных пунктов из{" "}
          {criteria.length}. Ниже видно, сколько пунктов выполнено в каждом навыке.
        </p>
        <div className="competency-row">
          {Object.entries(result.competencies).map(([name, competency]) => (
            <div key={name}>
              <strong>{competencyName(name)}</strong>
              <p>
                {competency.percent === null
                  ? "Не оценивается: критическая ошибка"
                  : `${competency.passed} из ${competency.total} · ${competency.percent}%`}
              </p>
            </div>
          ))}
        </div>
        <p>
          Лояльность {attempt.loyalty}/100 показывает, как ваши слова и действия
          повлияли на пассажира в этой учебной ситуации. Она не входит в формулу
          оценки. Часть решений также учитывается в навыке «Общение с пассажиром».
        </p>
        <p>
          Безопасность {attempt.safety}/100 показывает состояние ситуации. Для
          зачёта нужно не менее 80; критическая ошибка всегда означает незачёт.
        </p>
      </section>

      <PracticeOptions
        options={attempt.practice_options || []}
        busy={busy}
        start={startPractice}
      />

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
