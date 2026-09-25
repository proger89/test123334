import {
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Pause,
  Timer,
  GraduationCap,
} from "lucide-react";
import type { Attempt, PracticeRecommendation } from "./api";

type OptionsProps = {
  options: PracticeRecommendation[];
  busy: boolean;
  start: (exercise: string) => void;
};
export function PracticeOptions({ options, busy, start }: OptionsProps) {
  if (!options.length) return null;
  return (
    <section className="practice-options" aria-label="Рекомендуемые упражнения">
      <p className="eyebrow">Следующий шаг</p>
      <h2>Отработайте то, что не получилось</h2>
      <p>
        Короткие ситуации по разбору этой смены. Каждая займёт около двух минут.
      </p>
      <div className="practice-cards">
        {options.map((option) => (
          <article key={option.id}>
            <GraduationCap aria-hidden="true" />
            <h3>{option.title}</h3>
            <p>{option.reason}</p>
            <details>
              <summary>Почему предложено это упражнение</summary>
              <ul>
                {option.before.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </details>
            <button
              className="primary"
              disabled={busy}
              onClick={() => start(option.id)}
            >
              Отработать ошибку
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

type Props = {
  attempt: Attempt;
  seconds: number | null | undefined;
  busy: boolean;
  command: (operation: string, body?: Record<string, unknown>) => void;
  openSource: () => void;
  repeat: () => void;
  check: () => void;
};
export function PracticeScreen({
  attempt,
  seconds,
  busy,
  command,
  openSource,
  repeat,
  check,
}: Props) {
  const practice = attempt.practice!;
  const current = attempt.threads[0];
  const result = attempt.result;
  return (
    <section className="practice-screen" aria-label="Отработка ошибки">
      <button className="text-button" disabled={busy} onClick={openSource}>
        <ArrowLeft size={18} />К разбору смены
      </button>
      <p className="eyebrow">Отработка ошибки · без рейтинговых баллов</p>
      <h1>{attempt.title}</h1>
      {result ? (
        <>
          <div
            className={"practice-verdict " + (result.passed ? "success" : "")}
            role="status"
          >
            {result.passed ? <CheckCircle /> : <AlertTriangle />}
            <div>
              <h2>
                {result.passed
                  ? "В упражнении получилось"
                  : "Попробуйте ещё раз"}
              </h2>
              <p>
                {result.passed
                  ? "Вы выполнили все пункты упражнения. Теперь проверьте себя в полной смене без подсказок."
                  : "Не все пункты выполнены. Посмотрите объяснения и повторите упражнение."}
              </p>
            </div>
          </div>
          <div className="practice-comparison">
            <article>
              <h2>В исходной смене</h2>
              <ul>
                {practice.before.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </article>
            <article>
              <h2>В этом упражнении</h2>
              <ul>
                {Object.entries(result.rubric).map(([key, rule]) => (
                  <li key={key}>
                    {rule.label} —{" "}
                    {result.checks[key] ? "выполнено" : "стоит повторить"}.
                  </li>
                ))}
              </ul>
              {result.critical && (
                <p className="orange">
                  Критическая ошибка. Упражнение не выполнено.
                </p>
              )}
            </article>
          </div>
          <h2>Разбор решений</h2>
          {result.events.map((event, index) => (
            <article className="event" key={index}>
              <span>{index + 1}</span>
              <div>
                <h3>{event.action}</h3>
                <p>{event.explanation}</p>
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
                </a>
              </div>
            </article>
          ))}
          <div className="game-tools">
            <button
              className={result.passed ? "primary" : ""}
              disabled={busy}
              onClick={check}
            >
              Пройти самостоятельную проверку
            </button>
            <button
              className={!result.passed ? "primary" : ""}
              disabled={busy}
              onClick={repeat}
            >
              Повторить упражнение
            </button>
          </div>
          <p className="footnote">
            Успех в коротком упражнении не заменяет самостоятельную проверку.
            Оценка исходной смены и рейтинг не изменились.
          </p>
        </>
      ) : (
        <>
          <p className="lead">{practice.intro}</p>
          <div className="practice-workspace">
            <article className="practice-task">
              <p className="eyebrow">Шаг {practice.completed_steps + 1}</p>
              <h2>Ваше действие</h2>
              {attempt.status === "paused" ? (
                <div className="paused">
                  <Pause />
                  Упражнение приостановлено
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => command("pause", { paused: false })}
                  >
                    Продолжить упражнение
                  </button>
                </div>
              ) : (
                <>
                  <p className="practice-situation">{current.text}</p>
                  <div className="actions">
                    {current.actions.map((action) => (
                      <button
                        key={action.id}
                        disabled={busy}
                        onClick={() =>
                          command("actions", {
                            thread_id: current.id,
                            action_id: action.id,
                          })
                        }
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </article>
            <aside className="practice-context">
              <img
                src={
                  "/graphics/crops/" +
                  (attempt.scenario === "service"
                    ? "cabin_standard"
                    : "vestibule_reference") +
                  ".png"
                }
                alt="Иллюстрация вагона"
              />
              {seconds != null && (
                <div className="practice-timer">
                  <Timer aria-hidden="true" />
                  <div>
                    <b>
                      {practice.id === "priority"
                        ? "Освободить проход"
                        : "Сообщить ответственным"}
                    </b>
                    <p>{Math.ceil(seconds)} сек.</p>
                  </div>
                </div>
              )}
              <p>
                Это новая учебная ситуация. Обстоятельства отличаются от
                исходной смены.
              </p>
              <p className="footnote">
                Срок задан для тренировки. Его можно остановить паузой.
              </p>
            </aside>
          </div>
          <div className="game-tools">
            {attempt.status !== "paused" && (
              <button
                disabled={busy}
                onClick={() => command("pause", { paused: true })}
              >
                <Pause size={18} />
                Пауза
              </button>
            )}
            <button disabled={busy} onClick={() => command("finish")}>
              Завершить упражнение
            </button>
          </div>
          <p className="footnote">
            Результат сохранится отдельно от полных смен. Упражнение не даёт
            баллов или наград и не учитывается в испытании.
          </p>
        </>
      )}
    </section>
  );
}
