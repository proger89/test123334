import { Flag, ShieldCheck, Trophy, Route } from "lucide-react";
import type { Progress } from "./api";

export const competencyName = (name: string) =>
  ({
    Общение: "Общение с пассажиром",
    Безопасность: "Безопасность и приоритеты",
  })[name] || name;

export function Achievements({
  progress,
  openAttempt,
}: {
  progress: Progress;
  openAttempt: (id: string) => void;
}) {
  const icons = {
    first: Flag,
    service: Route,
    security: ShieldCheck,
    both: Trophy,
  };
  return (
    <section aria-label="Достижения">
      <h2>Достижения</h2>
      <div className="achievement-grid">
        {progress.achievements.map((a) => {
          const Icon = icons[a.code as keyof typeof icons] || Trophy;
          return (
            <article
              key={a.code}
              className={
                a.earned_at ? "achievement earned" : "achievement locked"
              }
            >
              <Icon aria-hidden="true" size={30} />
              <h3>{a.title}</h3>
              <p>{a.condition}</p>
              {a.earned_at ? (
                <>
                  <small>
                    Получено {new Date(a.earned_at).toLocaleString("ru")}
                  </small>
                  {a.attempt_id ? (
                    <button onClick={() => openAttempt(a.attempt_id!)}>
                      Смена, за которую получено
                    </button>
                  ) : (
                    <small>Получено до добавления ссылки на смену.</small>
                  )}
                </>
              ) : (
                <small>Ещё не получено</small>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function Competencies({
  progress,
  openAttempt,
}: {
  progress: Progress;
  openAttempt: (id: string) => void;
}) {
  return (
    <section aria-label="Компетенции">
      <h2>Навыки в последней смене</h2>
      <p className="muted">
        Для каждого сценария, режима и версии показана последняя завершённая
        попытка. Старые ошибки остаются в истории и не заменяют новый результат.
      </p>
      {!progress.competencies.length && (
        <p>Пока недостаточно данных: завершите смену.</p>
      )}
      {progress.competencies.map((c) => (
        <article
          className="skill-card"
          key={[c.scenario, c.version, c.mode, c.name].join(":")}
        >
          <div className="competency">
            <span>
              <b>{competencyName(c.name)}</b>
              <small>
                {c.scenario === "service"
                  ? "Сервис и свободный проход"
                  : "Похожая вещь — другое решение"}
                {" · "}
                {c.mode === "train" ? "Обучение" : "Проверка"} · версия{" "}
                {c.version}
              </small>
            </span>
            <strong className={c.latest_critical ? "orange" : ""}>
              {c.latest_critical
                ? "Критическая ошибка"
                : c.latest_percent + "%"}
            </strong>
          </div>
          <p>
            Выполнено пунктов: {c.latest_passed} из {c.latest_total}.{" "}
            {new Date(c.latest_finished_at).toLocaleString("ru")}
          </p>
          <button onClick={() => openAttempt(c.latest_attempt_id)}>
            Разбор этой смены
          </button>
          <details>
            <summary>История: попыток — {c.attempts}</summary>
            <p>
              За эти попытки выполнено {c.passed} из {c.total} пунктов.
              {c.critical_attempts > 0
                ? ` Попыток с критической ошибкой: ${c.critical_attempts}. Откройте историю смен ниже, чтобы посмотреть каждую.`
                : ` Доля выполненных пунктов: ${c.percent}%. Критических ошибок не было.`}
            </p>
            <small>
              До пяти последних попыток этого сценария, режима и версии. Это
              результаты учебных ситуаций, а не оценка профессиональной
              пригодности.
            </small>
          </details>
        </article>
      ))}
    </section>
  );
}
