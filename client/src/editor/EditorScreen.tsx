import { useEffect, useState } from "react";
import { api } from "../api";
import { requestId } from "../requestId";
import { ActionForm } from "./ActionForm";
import { PreviewScreen } from "./PreviewScreen";
import {
  newAction,
  threadLabels,
  type Draft,
  type Definition,
  type Library,
  type Preview,
} from "./types";
import "./editor.css";
export function EditorScreen({
  onDirty,
  onPublished,
}: {
  onDirty: (dirty: boolean) => void;
  onPublished: () => void;
}) {
  const [authorized, setAuthorized] = useState<boolean | null>(null),
    [code, setCode] = useState(""),
    [library, setLibrary] = useState<Library>({ versions: [], drafts: [] }),
    [base, setBase] = useState(""),
    [draft, setDraft] = useState<Draft | null>(null),
    [definition, setDefinition] = useState<Definition | null>(null),
    [step, setStep] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [seat, setSeat] = useState(true),
    [confirmPublish, setConfirmPublish] = useState(false);
  const dirty =
    !!draft && JSON.stringify(draft.definition) !== JSON.stringify(definition);
  const locked = busy || !!draft?.published_version;
  useEffect(() => {
    onDirty(dirty);
    const stop = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", stop);
    return () => {
      onDirty(false);
      window.removeEventListener("beforeunload", stop);
    };
  }, [dirty, onDirty]);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось выполнить действие",
      );
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    const value = await api<Library>("/editor");
    setLibrary(value);
    setBase(
      (old) =>
        old || value.versions[0]?.scenario + ":" + value.versions[0]?.version,
    );
  }
  useEffect(() => {
    void run(async () => {
      const status = await api<{ authorized: boolean }>("/editor/access");
      setAuthorized(status.authorized);
      if (status.authorized) await refresh();
    });
  }, []);
  function accept(value: Draft) {
    setDraft(value);
    setDefinition(value.definition);
    setStep((old) =>
      value.definition.nodes[old]
        ? old
        : Object.keys(value.definition.nodes)[0],
    );
    setConfirmPublish(false);
    setPreview(null);
  }
  function leave() {
    return (
      !dirty ||
      window.confirm("Есть несохранённые изменения. Уйти без сохранения?")
    );
  }
  async function create(scenario: string, version: string) {
    if (!leave()) return;
    await run(async () => {
      accept(
        await api<Draft>("/editor/drafts", "POST", {
          request_id: requestId(),
          scenario,
          version,
        }),
      );
      await refresh();
    });
  }
  function edit(change: (d: Definition) => void) {
    if (locked || !definition) return;
    const next = structuredClone(definition);
    change(next);
    setDefinition(next);
    setMessage("");
    setConfirmPublish(false);
  }
  async function save() {
    if (!draft || !definition) return;
    await run(async () => {
      accept(
        await api<Draft>("/editor/drafts/" + draft.id, "PUT", {
          expected_revision: draft.revision,
          definition: JSON.stringify(definition),
        }),
      );
      setMessage("Черновик сохранён.");
      await refresh();
    });
  }
  if (authorized === null)
    return (
      <section className="editor">
        <h1>Редактор сценариев</h1>
        <p role={error ? "alert" : "status"}>{error || "Проверяем доступ…"}</p>
        {error && <button onClick={() => location.reload()}>Повторить</button>}
      </section>
    );
  if (!authorized)
    return (
      <section className="editor">
        <p className="eyebrow">Для автора обучения</p>
        <h1>Редактор сценариев</h1>
        <p>
          Здесь можно изменить реплики и ветки смены, попробовать их и
          опубликовать новую версию для обучения.
        </p>
        <form
          className="editor-card editor-login"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api("/editor/login", "POST", { code });
              setCode("");
              await refresh();
              setAuthorized(true);
            });
          }}
        >
          <h2>Вход для методиста</h2>
          <label>
            Код доступа
            <input
              type="password"
              autoComplete="current-password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </label>
          <p>
            Код выдаёт владелец приложения. Доступ действует 8 часов в этом
            браузере.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Открываем…" : "Открыть редактор"}
          </button>
        </form>
      </section>
    );
  const current = definition?.nodes[step];
  return (
    <section className="editor">
      <div className="editor-row">
        <div>
          <p className="eyebrow">Для автора обучения</p>
          <h1>Редактор сценариев</h1>
        </div>
        <button
          disabled={busy}
          onClick={() => {
            if (leave())
              void run(async () => {
                await api("/editor/logout", "POST");
                setAuthorized(false);
                setDraft(null);
                setDefinition(null);
              });
          }}
        >
          Закрыть доступ
        </button>
      </div>
      <p>
        Сначала сохраните черновик, затем пройдите его сами. Публикация добавит
        новую версию только в обучение. Проверки и прежние результаты
        сохранятся.
      </p>
      {error && (
        <div className="error" role="alert">
          {error}
          {draft && (
            <p>
              Ваш текст остаётся в форме. Если черновик изменён в другой
              вкладке, скопируйте свои правки перед повторной загрузкой.
            </p>
          )}
        </div>
      )}
      {message && (
        <p className="editor-success" role="status">
          {message}
        </p>
      )}
      {preview ? (
        <PreviewScreen
          key={preview.id}
          initial={preview}
          onClose={() => setPreview(null)}
        />
      ) : (
        <>
          <div className="editor-card editor-library">
            <label>
              Взять за основу
              <select value={base} onChange={(e) => setBase(e.target.value)}>
                {library.versions.map((v) => (
                  <option
                    key={v.scenario + v.version}
                    value={v.scenario + ":" + v.version}
                  >
                    {v.title} · версия {v.version}
                    {v.ranked ? " · для проверки" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary"
              disabled={busy || !base}
              onClick={() => {
                const [s, v] = base.split(":");
                void create(s, v);
              }}
            >
              Создать черновик
            </button>
            {!!library.drafts.length && (
              <label>
                Мои черновики
                <select
                  value={draft?.id ?? ""}
                  disabled={busy}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id && leave())
                      void run(async () =>
                        accept(await api<Draft>("/editor/drafts/" + id)),
                      );
                  }}
                >
                  <option value="">Выбрать черновик</option>
                  {library.drafts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                      {d.published_version
                        ? " · опубликован, версия " + d.published_version
                        : " · черновик"}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {draft && definition && (
            <>
              <div className="editor-toolbar">
                <b>
                  {draft.published_version
                    ? "Опубликована версия " + draft.published_version
                    : dirty
                      ? "Есть несохранённые изменения"
                      : "Черновик сохранён"}
                </b>
                <div className="editor-row">
                  <button
                    disabled={locked || !dirty}
                    onClick={() => void save()}
                  >
                    Сохранить черновик
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (leave())
                        void run(async () =>
                          accept(
                            await api<Draft>("/editor/drafts/" + draft.id),
                          ),
                        );
                    }}
                  >
                    Загрузить сохранённое
                  </button>
                  <button
                    disabled={busy || dirty || !!draft.issues.length}
                    onClick={() =>
                      void run(async () =>
                        setPreview(
                          await api<Preview>(
                            "/editor/drafts/" + draft.id + "/preview",
                            "POST",
                            { expected_revision: draft.revision, seat },
                          ),
                        ),
                      )
                    }
                  >
                    Попробовать
                  </button>
                  <button
                    className="primary"
                    disabled={locked || dirty || !!draft.issues.length}
                    onClick={() => setConfirmPublish(true)}
                  >
                    Опубликовать
                  </button>
                </div>
              </div>
              {dirty ? (
                <p>
                  Сохраните изменения, чтобы проверить переходы и попробовать
                  сценарий.
                </p>
              ) : draft.issues.length ? (
                <div className="error" role="alert">
                  <b>Перед публикацией нужно исправить:</b>
                  <ul>
                    {draft.issues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="editor-success">
                  Переходы и условия проверены. Сценарий можно попробовать.
                </p>
              )}
              {confirmPublish && (
                <div
                  className="editor-card editor-confirm"
                  role="region"
                  aria-label="Подтверждение публикации"
                >
                  <h2>Опубликовать для обучения?</h2>
                  <p>
                    Эту версию увидят все сотрудники при начале новой учебной
                    смены. Она сохранится отдельно; уже начатые смены
                    продолжатся без изменений.
                  </p>
                  <div className="editor-row">
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const published = await api<Draft>(
                            "/editor/drafts/" + draft.id + "/publish",
                            "POST",
                            { expected_revision: draft.revision },
                          );
                          accept(published);
                          setMessage(
                            "Версия " +
                              published.published_version +
                              " доступна в обучении.",
                          );
                          await refresh();
                          onPublished();
                        })
                      }
                    >
                      Опубликовать для обучения
                    </button>
                    <button onClick={() => setConfirmPublish(false)}>
                      Отмена
                    </button>
                  </div>
                </div>
              )}
              {definition.id === "service" && (
                <label className="editor-check">
                  <input
                    type="checkbox"
                    checked={seat}
                    onChange={(e) => setSeat(e.target.checked)}
                  />
                  В пробном прохождении есть свободное место того же класса
                </label>
              )}
              <fieldset className="editor-fields" disabled={locked}>
                <div className="editor-card">
                  <h2>Условия смены</h2>
                  <label>
                    Название сценария
                    <input
                      maxLength={120}
                      value={definition.title}
                      onChange={(e) =>
                        edit((d) => {
                          d.title = e.target.value;
                        })
                      }
                    />
                  </label>
                  <label>
                    Описание ситуации
                    <textarea
                      maxLength={2000}
                      value={definition.intro}
                      onChange={(e) =>
                        edit((d) => {
                          d.intro = e.target.value;
                        })
                      }
                    />
                  </label>
                  <label>
                    Срок критического обращения, секунд
                    <input
                      type="number"
                      min={1}
                      max={600}
                      value={definition.seconds}
                      onChange={(e) =>
                        edit((d) => {
                          d.seconds = Number(e.target.value);
                        })
                      }
                    />
                  </label>
                  <p>
                    Это учебный срок, а не норматив перевозчика. Последствие
                    просрочки и правила зачёта задаёт тренажёр.
                  </p>
                  {Object.entries(definition.initial).map(([id, value]) => (
                    <label key={id}>
                      Первый шаг: {threadLabels[id]}
                      <select
                        value={value}
                        onChange={(e) =>
                          edit((d) => {
                            d.initial[id] = e.target.value;
                          })
                        }
                      >
                        {Object.entries(definition.nodes).map(([key, n]) => (
                          <option key={key} value={key}>
                            {key} · {n.text.slice(0, 70)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <div className="editor-workspace">
                  <section className="editor-steps">
                    <h2>Шаги сценария</h2>
                    <p>
                      Выберите шаг, чтобы изменить ситуацию и варианты действий.
                    </p>
                    {Object.entries(definition.nodes).map(([id, n], i) => (
                      <button
                        className={step === id ? "active" : ""}
                        type="button"
                        key={id}
                        onClick={() => setStep(id)}
                      >
                        <small>
                          Шаг {i + 1} · {id}
                        </small>
                        <span>{n.text.slice(0, 95) || "Новый шаг"}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const id =
                          "step_" + requestId().replaceAll("-", "").slice(0, 8);
                        edit((d) => {
                          d.nodes[id] = {
                            text: "Новая ситуация",
                            actions: [newAction()],
                          };
                        });
                        setStep(id);
                      }}
                    >
                      Добавить шаг
                    </button>
                  </section>
                  {current && (
                    <section className="editor-card">
                      <div className="editor-row">
                        <h2>
                          Шаг {Object.keys(definition.nodes).indexOf(step) + 1}
                        </h2>
                        <button
                          type="button"
                          disabled={Object.values(definition.initial).includes(
                            step,
                          )}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Удалить шаг? Переходы на него нужно будет исправить.",
                              )
                            ) {
                              edit((d) => {
                                delete d.nodes[step];
                              });
                              setStep(
                                Object.keys(definition.nodes).find(
                                  (id) => id !== step,
                                ) ?? "",
                              );
                            }
                          }}
                        >
                          Удалить шаг
                        </button>
                      </div>
                      <label>
                        Текст ситуации
                        <textarea
                          maxLength={2000}
                          value={current.text}
                          onChange={(e) =>
                            edit((d) => {
                              d.nodes[step].text = e.target.value;
                            })
                          }
                        />
                      </label>
                      {current.actions.map((a, i) => (
                        <ActionForm
                          key={a.id}
                          index={i}
                          action={a}
                          definition={definition}
                          onChange={(value) =>
                            edit((d) => {
                              d.nodes[step].actions[i] = value;
                            })
                          }
                          onRemove={() =>
                            edit((d) => {
                              d.nodes[step].actions.splice(i, 1);
                            })
                          }
                        />
                      ))}
                      <button
                        type="button"
                        disabled={current.actions.length >= 12}
                        onClick={() =>
                          edit((d) => {
                            d.nodes[step].actions.push(newAction());
                          })
                        }
                      >
                        Добавить действие
                      </button>
                    </section>
                  )}
                </div>
              </fieldset>
            </>
          )}
        </>
      )}
    </section>
  );
}
