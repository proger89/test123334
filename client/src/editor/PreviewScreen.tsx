import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { requestId } from "../requestId";
import { poll } from "../poll";
import { threadLabels, type Preview } from "./types";
export function PreviewScreen({
  initial,
  onClose,
}: {
  initial: Preview;
  onClose: () => void;
}) {
  const [state, setState] = useState(initial),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const accept = (next: Preview) =>
    setState((old) => (old.revision > next.revision ? old : next));
  useEffect(() => {
    if (state.status === "completed") return;
    return poll(
      () => api<Preview>("/editor/previews/" + initial.id),
      1000,
      (e) => setError(e?.message ?? ""),
      accept,
    );
  }, [initial.id, state.status]);
  async function command(operation: string, extra: object = {}) {
    setBusy(true);
    setError("");
    try {
      accept(
        await api<Preview>(
          "/editor/previews/" + state.id + "/" + operation,
          "POST",
          {
            request_id: requestId(),
            expected_revision: state.revision,
            ...extra,
          },
        ),
      );
    } catch (e) {
      if (e instanceof ApiError && e.state) accept(e.state);
      setError(
        e instanceof Error ? e.message : "Не удалось выполнить действие",
      );
    } finally {
      setBusy(false);
    }
  }
  const remaining =
    state.deadline === null
      ? state.remaining
      : Math.max(0, Math.ceil(state.deadline - state.server_time));
  return (
    <section className="editor-preview">
      <div className="editor-row">
        <h2>Пробное прохождение</h2>
        <button onClick={onClose}>Вернуться к черновику</button>
      </div>
      <p>
        Это проверка сценария автором. Она не меняет прогресс, достижения и
        рейтинг сотрудников.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="editor-row">
        <b>Лояльность: {state.loyalty}</b>
        <b>Безопасность: {state.safety}</b>
        {remaining !== null && <b>Срок обращения: {Math.ceil(remaining)} с</b>}
      </div>
      {state.status === "paused" && (
        <p role="status">Пробное прохождение на паузе.</p>
      )}
      {state.status !== "completed" && (
        <>
          <div className="editor-columns">
            {state.threads.map((t) => (
              <article className="editor-card" key={t.id}>
                <h3>{threadLabels[t.id] ?? "Обращение"}</h3>
                <p>{t.text}</p>
                <div className="actions">
                  {t.actions.map((a) => (
                    <button
                      key={a.id}
                      disabled={busy || state.status === "paused"}
                      onClick={() =>
                        void command("actions", {
                          thread_id: t.id,
                          action_id: a.id,
                        })
                      }
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <div className="editor-row">
            <button
              disabled={busy}
              onClick={() =>
                void command("pause", { paused: state.status !== "paused" })
              }
            >
              {state.status === "paused" ? "Продолжить" : "Пауза"}
            </button>
            <button disabled={busy} onClick={() => void command("finish")}>
              Закончить пробу
            </button>
          </div>
        </>
      )}
      {state.last_decision && (
        <p className="decision-feedback">{state.last_decision.explanation}</p>
      )}
      {state.result && (
        <>
          <h3>
            {state.result.passed ? "Зачёт" : "Незачёт"} · {state.result.score}{" "}
            из 100
          </h3>
          <ul>
            {Object.entries(state.result.rubric).map(([id, r]) => (
              <li key={id}>
                {state.result!.checks[id] ? "✓" : "—"} {r.label}
              </li>
            ))}
          </ul>
          {state.result.events.map((e, i) => (
            <article className="editor-card" key={i}>
              <b>{e.action}</b>
              <p>{e.explanation}</p>
              <small>{e.source}</small>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
