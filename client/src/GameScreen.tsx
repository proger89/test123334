import type { Attempt } from "./api";
import {
  Pause,
  Play,
  ChevronRight,
  Lightbulb,
  LogOut,
  Plug,
  BriefcaseBusiness,
  CheckCircle,
  Timer,
  Heart,
  ShieldCheck,
} from "lucide-react";
const img = (name: string) => "/graphics/crops/" + name + ".png";
const threadName = (id: string) =>
  id === "service"
    ? "Розетка"
    : id === "baggage"
      ? "Багаж в проходе"
      : "Багаж без владельца";
type Props = {
  attempt: Attempt;
  current: Attempt["threads"][number] | undefined;
  thread: string;
  setThread: (thread: string) => void;
  busy: boolean;
  command: (operation: string, body?: Record<string, unknown>) => void;
  hint: boolean;
  setHint: (hint: boolean) => void;
  seconds: number | null | undefined;
};
export function GameScreen({
  attempt,
  current,
  thread,
  setThread,
  busy,
  command,
  hint,
  setHint,
  seconds,
}: Props) {
  return (
    <div className="game">
      <section className="dialogue">
        <p className="breadcrumb">Сценарии / {attempt.title}</p>
        <h1>
          {thread === "service"
            ? "Помогите пассажиру"
            : thread === "baggage"
              ? "Освободите проход"
              : "Оцените обстоятельства"}
        </h1>
        <div className="dialogue-scene">
          <div
            className="passenger"
            role="img"
            aria-label="Пассажир в вагоне"
          />
          <div className="speech">
            <strong>
              {thread === "service" ? "Пассажир" : "Текущая ситуация"}
            </strong>
            <p>{current?.text}</p>
          </div>
        </div>
        <h2>Ваше действие</h2>
        {attempt.status === "paused" ? (
          <div className="paused">
            <Pause />
            Смена приостановлена
            <button
              className="primary"
              onClick={() => command("pause", { paused: false })}
            >
              Продолжить
            </button>
          </div>
        ) : (
          <div className="actions">
            {current?.actions.map((a) => (
              <button
                disabled={busy}
                key={a.id}
                onClick={() =>
                  command("actions", {
                    thread_id: current.id,
                    action_id: a.id,
                  })
                }
              >
                {a.label}
                <ChevronRight size={20} />
              </button>
            ))}
            {current?.closed && (
              <p>
                Обращение завершено.{" "}
                {attempt.threads.some((t) => !t.closed)
                  ? "Перейдите к другому обращению."
                  : "Ожидайте развития ситуации."}
              </p>
            )}
          </div>
        )}
        {hint && (
          <div className="hint">
            {thread === "service"
              ? "Извинитесь, проверьте допустимую альтернативу, сообщите начальнику поезда и инженеру. Вернитесь с подтверждённой информацией."
              : thread === "baggage"
                ? "Установите владельца. Вежливо объясните причину и укажите конкретное место для багажа."
                : "Не перемещайте бесхозную вещь. Предупредите пассажиров и сообщите начальнику поезда и транспортной безопасности."}
          </div>
        )}
        <div className="game-tools">
          {attempt.mode === "train" && (
            <>
              <button onClick={() => setHint(!hint)}>
                <Lightbulb />
                Подсказка
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  command("pause", {
                    paused: attempt.status !== "paused",
                  })
                }
              >
                {attempt.status === "paused" ? <Play /> : <Pause />}
                {attempt.status === "paused" ? "Продолжить" : "Пауза"}
              </button>
            </>
          )}
          <button
            className="exit"
            disabled={busy}
            onClick={() => command("finish")}
          >
            <LogOut size={18} />
            Завершить
          </button>
        </div>
      </section>
      <aside>
        <h3>Текущая ситуация</h3>
        <img
          className="cabin"
          src={img("cabin_standard")}
          alt="Иллюстрация салона"
        />
        <h3>
          {attempt.threads.length > 1
            ? "Два обращения одновременно"
            : "Текущее обращение"}
        </h3>
        <div className="threads">
          {attempt.threads.map((t) => (
            <button
              key={t.id}
              className={current?.id === t.id ? "active" : ""}
              onClick={() => {
                setThread(t.id);
                setHint(false);
              }}
            >
              {t.id === "service" ? <Plug /> : <BriefcaseBusiness />}
              <span>
                <strong>{threadName(t.id)}</strong>
                <small>{t.closed ? "Завершено" : "Ожидает решения"}</small>
              </span>
              {t.closed && <CheckCircle size={16} />}
            </button>
          ))}
        </div>
        {seconds !== null && seconds !== undefined && (
          <div className="timer">
            <Timer size={32} />
            <b>00:{String(seconds).padStart(2, "0")}</b>
            <span>
              {attempt.scenario === "service"
                ? "Освободить проход"
                : "Сообщить ответственным"}
              <small>Срок идёт при переключении обращений</small>
            </span>
          </div>
        )}
        <h3>Показатели (текущие)</h3>
        <Gauge label="Лояльность" value={attempt.loyalty} kind="loyalty" />
        <Gauge label="Безопасность" value={attempt.safety} kind="safety" />
        <p className="footnote">
          Учебная ситуация · время задано авторами тренажёра
        </p>
      </aside>
    </div>
  );
}
function Gauge({
  label,
  value,
  kind,
}: {
  label: string;
  value: number;
  kind: string;
}) {
  return (
    <div className={"gauge " + kind}>
      {kind === "loyalty" ? <Heart /> : <ShieldCheck />}
      <div>
        <b>{label}</b>
        <progress max={100} value={value} />
      </div>
      <span>{value}/100</span>
    </div>
  );
}
