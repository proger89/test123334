import { EditorScreen } from "./editor/EditorScreen";
import { poll } from "./poll";
import { GameScreen } from "./GameScreen";
import { requestId } from "./requestId";
import { PracticeScreen } from "./PracticeScreen";
import { ResultsScreen } from "./ResultsScreen";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  MessageCircle,
  ChartNoAxesColumn,
  Trophy,
  Bell,
  GraduationCap,
  ChevronRight,
  Play,
  ArrowLeft,
  FilePenLine,
} from "lucide-react";
import {
  api,
  ApiError,
  type Attempt,
  type Me,
  type Scenario,
  type Progress,
  type Notice,
  type Rank,
} from "./api";
import "./style.css";
const img = (name: string) => "/graphics/crops/" + name + ".png";
function App() {
  const practiceTrigger = useRef<HTMLElement | null>(null);
  const [me, setMe] = useState<Me | null>(null),
    [scenarios, setScenarios] = useState<Scenario[]>([]),
    [page, setPageState] = useState(
      location.hash === "#editor" ? "editor" : "scenarios",
    ),
    [editorDirty, setEditorDirty] = useState(false),
    [noticeError, setNoticeError] = useState(""),
    [gameError, setGameError] = useState(""),
    [attempt, setAttempt] = useState<Attempt | null>(null),
    [thread, setThread] = useState("service"),
    [mode, setMode] = useState<"train" | "check">("train"),
    [seat, setSeat] = useState(true),
    [selected, setSelected] = useState<Scenario | null>(null),
    [progress, setProgress] = useState<Progress | null>(null),
    [notices, setNotices] = useState<Notice[]>([]),
    [ranks, setRanks] = useState<Rank[]>([]),
    [scope, setScope] = useState("brigade"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [activeConflict, setActiveConflict] = useState<string | null>(null),
    [hint, setHint] = useState(false),
    [name, setName] = useState(""),
    [portrait, setPortrait] = useState("conductor_card");
  const setPage = (next: string) => {
    if (
      page === "editor" &&
      next !== page &&
      editorDirty &&
      !window.confirm("Есть несохранённые изменения. Уйти без сохранения?")
    )
      return;
    setPageState(next);
    history.replaceState(
      null,
      "",
      next === "editor" ? "#editor" : location.pathname,
    );
  };
  const accept = (next: Attempt) =>
    setAttempt((old) =>
      old?.id === next.id && old.revision > next.revision ? old : next,
    );
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.code === "active_attempt" &&
        e.activeAttemptId
      ) {
        setActiveConflict(e.activeAttemptId);
        return;
      }
      if (e instanceof ApiError && e.state) accept(e.state);
      setError(e instanceof Error ? e.message : "Ошибка соединения");
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    const m = await api<Me>("/me");
    setMe(m);
    setProgress(m.progress);
  };
  useEffect(() => {
    void run(async () => {
      const m = await api<Me>("/bootstrap");
      setMe(m);
      setProgress(m.progress);
      setName(m.profile.name);
      setPortrait(m.profile.portrait);
      setScenarios(await api<Scenario[]>("/scenarios"));
      setNotices(await api<Notice[]>("/notifications"));
      if (m.active_attempt) {
        const a = await api<Attempt>("/attempts/" + m.active_attempt);
        accept(a);
        setThread(a.threads[0].id);
        if (location.hash !== "#editor") setPage("game");
        if (a.status === "completed") await refresh();
      }
    });
  }, []);
  useEffect(() => {
    if (!attempt || attempt.status === "completed") return;
    return poll(
      () => api<Attempt>("/attempts/" + attempt.id),
      1000,
      (e) => setGameError(e?.message ?? ""),
      (a) => {
        accept(a);
        if (a.status === "completed")
          void refresh().catch((e) => setGameError(e.message));
      },
    );
  }, [attempt?.id, attempt?.status]);
  useEffect(() => {
    if (!me || !["progress", "notifications", "ranking"].includes(page)) return;
    void run(async () => {
      if (page === "progress") setProgress(await api<Progress>("/me/progress"));
      if (page === "notifications")
        setNotices(await api<Notice[]>("/notifications"));
      if (page === "ranking")
        setRanks(await api<Rank[]>("/leaderboard?scope=" + scope));
    });
  }, [page, scope]);
  useEffect(() => {
    if (!me) return;
    return poll(
      async () => ({
        notices: await api<Notice[]>("/notifications"),
        progress:
          page === "progress" ? await api<Progress>("/me/progress") : null,
        ranks:
          page === "ranking"
            ? await api<Rank[]>("/leaderboard?scope=" + scope)
            : null,
      }),
      5000,
      (e) => setNoticeError(e?.message ?? ""),
      (data) => {
        setNotices(data.notices);
        if (data.progress) setProgress(data.progress);
        if (data.ranks) setRanks(data.ranks);
      },
    );
  }, [me?.profile.id, page, scope]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page, attempt?.id, attempt?.status]);
  useEffect(() => {
    if (!selected && !activeConflict) return;
    const previous = activeConflict
      ? practiceTrigger.current
      : (document.activeElement as HTMLElement | null);
    const modal = document.querySelector<HTMLElement>('[role="dialog"]');
    const controls = () =>
      Array.from(
        modal?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),select,input",
        ) || [],
      );
    controls()[0]?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        setSelected(null);
        setActiveConflict(null);
      }
      if (event.key !== "Tab") return;
      const items = controls();
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault();
        items.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
        event.preventDefault();
        items[0]?.focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [selected, activeConflict, busy]);
  useEffect(() => {
    if (!error) return;
    const alert = document.querySelector<HTMLElement>('[role="alert"]');
    alert?.scrollIntoView({ block: "center" });
    alert?.focus({ preventScroll: true });
  }, [error]);
  const start = () =>
    void run(async () => {
      if (!selected) return;
      const a = await api<Attempt>("/attempts", "POST", {
        scenario: selected.id,
        mode,
        seat,
      });
      accept(a);
      setThread(a.threads[0].id);
      setHint(false);
      setPage("game");
      setSelected(null);
    });
  const command = (op: string, body: Record<string, unknown> = {}) =>
    void run(async () => {
      if (!attempt) return;
      const a = await api<Attempt>(
        "/attempts/" + attempt.id + "/" + op,
        "POST",
        {
          request_id: requestId(),
          expected_revision: attempt.revision,
          ...body,
        },
      );
      accept(a);
      setHint(false);
      if (a.status === "completed") await refresh();
    });
  const openAttempt = (id: string) =>
    void run(async () => {
      setPage("game");
      const next = await api<Attempt>("/attempts/" + id);
      accept(next);
      setThread(next.threads[0].id);
      await refresh();
    });
  const startPractice = (sourceId: string, exerciseId: string) => {
    // Disabling the trigger during the request removes its focus in Chrome.
    practiceTrigger.current = document.activeElement as HTMLElement | null;
    void run(async () => {
      const next = await api<Attempt>(
        "/attempts/" + sourceId + "/practice",
        "POST",
        {
          exercise_id: exerciseId,
          request_id: requestId(),
        },
      );
      accept(next);
      setThread(next.threads[0].id);
      setPage("game");
      setHint(false);
      await refresh();
    });
  };
  const current =
    attempt?.threads.find((t) => t.id === thread) || attempt?.threads[0];
  const seconds =
    attempt?.deadline === null
      ? attempt.remaining === null
        ? null
        : Math.max(0, Math.ceil(attempt.remaining))
      : Math.max(
          0,
          Math.ceil((attempt?.deadline ?? 0) - (attempt?.server_time ?? 0)),
        );
  const nav = [
    ["scenarios", "Сценарии", MessageCircle],
    ["progress", "Прогресс", ChartNoAxesColumn],
    ["ranking", "Рейтинг", Trophy],
    ["editor", "Редактор", FilePenLine],
  ] as const;
  if (!me)
    return (
      <div className="loading">
        <GraduationCap size={40} />
        <h1>Виртуальная смена</h1>
        <p>{error || "Готовим вашу смену…"}</p>
        {error && <button onClick={() => location.reload()}>Повторить</button>}
      </div>
    );
  return (
    <>
      <header>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("scenarios");
          }}
        >
          <span className="brand-mark" aria-hidden="true" />
          Виртуальная смена
        </a>
        <span className="mode">
          <GraduationCap size={21} />
          {page === "game" && attempt?.mode === "check"
            ? "Проверка"
            : "Обучение"}
        </span>
        <div className="header-right">
          <button
            className="icon"
            aria-label="Уведомления"
            onClick={() => setPage("notifications")}
          >
            <Bell />
            {notices.some((n) => !n.read) && (
              <span
                className="notice-count"
                aria-label={
                  "Непрочитанных: " + notices.filter((n) => !n.read).length
                }
              >
                {notices.filter((n) => !n.read).length}
              </span>
            )}
          </button>
          <button
            className="profile"
            aria-label="Мой профиль"
            onClick={() => setPage("profile")}
          >
            <img src={img(me.profile.portrait)} />
            <span>{me.profile.name}</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </header>
      <div className="layout">
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              aria-label={label}
              className={
                page === id || (page === "game" && id === "scenarios")
                  ? "active"
                  : ""
              }
              onClick={() => setPage(id)}
            >
              <Icon size={23} />
              <span>{label}</span>
            </button>
          ))}
          <div className="nav-note">
            Учебный тренажёр
            <br />
            для проводников ВСМ
          </div>
        </nav>
        <main>
          {(noticeError || gameError) && (
            <p className="error" role="status">
              {gameError || noticeError}
            </p>
          )}
          {page === "editor" && (
            <EditorScreen
              onDirty={setEditorDirty}
              onPublished={() => {
                void api<Scenario[]>("/scenarios")
                  .then(setScenarios)
                  .catch((e) => setError(e.message));
              }}
            />
          )}

          {error && (
            <div className="error" role="alert" tabIndex={-1}>
              {error}
              <button onClick={() => setError("")}>Закрыть</button>
            </div>
          )}
          {page === "scenarios" && (
            <section className="catalog">
              <p className="eyebrow">Виртуальная смена ВСМ</p>
              <h1>Выберите учебную смену</h1>
              <p className="lead">
                Практикуйтесь в рабочих ситуациях. Разбирайте ошибки и пробуйте
                снова.
              </p>
              {(me.active_attempt ||
                (attempt && attempt.status !== "completed")) && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => openAttempt(me.active_attempt || attempt!.id)}
                >
                  <Play size={18} />
                  Продолжить прохождение
                </button>
              )}
              <div className="scenario-list">
                {scenarios.map((s, i) => (
                  <article key={s.id}>
                    <img
                      src={img(
                        i === 0 ? "cabin_standard" : "vestibule_reference",
                      )}
                      alt="Иллюстрация вагона"
                    />
                    <div>
                      <span className="muted">
                        Смена 0{i + 1} ·{" "}
                        {i === 0
                          ? "Общение и приоритеты"
                          : "Внимание к обстоятельствам"}
                      </span>
                      <h2>{s.title}</h2>
                      <p>{s.intro}</p>
                      <button
                        className="primary"
                        onClick={() => setSelected(s)}
                      >
                        Подготовиться к смене <ChevronRight size={18} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              <p className="footnote">
                Учебная модель. Время и баллы заданы авторами. Иллюстрации не
                являются точной схемой подвижного состава.
              </p>
            </section>
          )}
          {page === "game" && attempt?.practice && (
            <PracticeScreen
              attempt={attempt}
              busy={busy}
              seconds={seconds}
              command={command}
              openSource={() =>
                openAttempt(attempt.practice!.source_attempt_id)
              }
              repeat={() =>
                startPractice(
                  attempt.practice!.source_attempt_id,
                  attempt.practice!.id,
                )
              }
              check={() => {
                setMode("check");
                setSelected(scenarios.find((s) => s.id === attempt.scenario)!);
              }}
            />
          )}
          {page === "game" &&
            attempt &&
            !attempt.practice &&
            !attempt.result && (
              <GameScreen
                attempt={attempt}
                current={current}
                thread={thread}
                setThread={setThread}
                busy={busy}
                command={command}
                hint={hint}
                setHint={setHint}
                seconds={seconds}
              />
            )}
          {page === "game" && attempt?.result && !attempt.practice && (
            <ResultsScreen
              attempt={attempt}
              result={attempt.result}
              busy={busy}
              startPractice={(id) => startPractice(attempt.id, id)}
              repeat={() => {
                setSelected(scenarios.find((s) => s.id === attempt.scenario)!);
                setMode("train");
              }}
              openProgress={() => setPage("progress")}
              openScenarios={() => setPage("scenarios")}
            />
          )}
          {page === "progress" && progress && (
            <section className="results">
              <h1>Мой прогресс</h1>
              <div className="stats">
                <div>
                  <strong>{progress.permanent}</strong>Основные баллы
                </div>
                <div>
                  <strong>{progress.bonus}</strong>Временные баллы
                </div>
                <div>
                  <strong>{progress.level}</strong>Уровень
                </div>
              </div>
              <h2>Достижения</h2>
              <div className="awards">
                {progress.awards.length ? (
                  progress.awards.map((a) => (
                    <div key={a.id}>
                      <Trophy />
                      <span>
                        <strong>{a.title}</strong>
                        <small>
                          {new Date(a.created_at).toLocaleDateString("ru")}
                        </small>
                      </span>
                    </div>
                  ))
                ) : (
                  <p>Завершите первую смену, чтобы получить достижение.</p>
                )}
              </div>
              <article className="challenge">
                <h2>Две проверки за 24 часа</h2>
                <p>
                  Пройдите обе смены в режиме проверки после вступления.
                  Награда: +20 баллов на 24 часа.
                </p>
                {progress.challenge ? (
                  <p>
                    {progress.challenge.completed_at
                      ? "Испытание выполнено"
                      : new Date(progress.challenge.expires_at) < new Date()
                        ? "Срок испытания истёк"
                        : "Участвуете до " +
                          new Date(
                            progress.challenge.expires_at,
                          ).toLocaleString("ru")}
                  </p>
                ) : (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () =>
                        setProgress(
                          await api<Progress>("/challenges/join", "POST", {}),
                        ),
                      )
                    }
                  >
                    Принять испытание
                  </button>
                )}
              </article>
              {progress.bonuses.map((b) => (
                <p key={b.id}>
                  {b.source.startsWith("demo:")
                    ? "Демонстрационный бонус"
                    : "Награда испытания"}
                  : {b.points} · до{" "}
                  {new Date(b.expires_at).toLocaleString("ru")}
                </p>
              ))}
              <h2>Компетенции</h2>
              <p className="muted">
                До пяти последних завершённых попыток каждого сценария, отдельно
                по режиму и версии.
              </p>
              {!progress.competencies.length && (
                <p>Пока недостаточно данных: завершите смену.</p>
              )}
              {progress.competencies.map((c, i) => (
                <article className="competency" key={i}>
                  <span>
                    <b>{c.name}</b>
                    <small>
                      {c.scenario === "service"
                        ? "Сервис и свободный проход"
                        : "Багаж без владельца"}{" "}
                      · {c.mode === "train" ? "Обучение" : "Проверка"} · версия{" "}
                      {c.version} · попыток: {c.attempts}
                    </small>
                  </span>
                  <strong className={c.critical ? "orange" : ""}>
                    {c.critical ? "Критическая ошибка" : c.percent + "%"}
                  </strong>
                </article>
              ))}
              {!!progress.practice_focus?.length && (
                <section
                  className="practice-options"
                  aria-label="Темы для повторения"
                >
                  <h2>Что стоит повторить</h2>
                  <p>
                    Пять последних смен каждого вида, отдельно по режиму и
                    версии. Ниже — пункты, которые чаще оставались
                    невыполненными.
                  </p>
                  {progress.practice_focus.map((item, index) => (
                    <article className="practice-focus" key={index}>
                      <div>
                        <h3>{item.label}</h3>
                        <p>
                          Не выполнено в {item.misses} из {item.observations}{" "}
                          смен.
                        </p>
                        <small>
                          {item.scenario === "service"
                            ? "Сервис и свободный проход"
                            : "Похожая вещь — другое решение"}{" "}
                          · {item.mode === "check" ? "Проверка" : "Обучение"} ·
                          версия {item.version}
                        </small>
                      </div>
                      {item.exercise_id ? (
                        <button
                          disabled={busy}
                          onClick={() =>
                            startPractice(
                              item.source_attempt_id,
                              item.exercise_id!,
                            )
                          }
                        >
                          Отработать ошибку
                        </button>
                      ) : (
                        <button
                          disabled={busy}
                          onClick={() => openAttempt(item.source_attempt_id)}
                        >
                          Открыть разбор
                        </button>
                      )}
                    </article>
                  ))}
                </section>
              )}
              <h2>История смен</h2>
              {progress.history.map((h) => (
                <button
                  className="history"
                  key={h.id}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      accept(await api<Attempt>("/attempts/" + h.id));
                      setPage("game");
                    })
                  }
                >
                  <span>
                    {h.scenario === "service"
                      ? "Сервис и свободный проход"
                      : "Похожая вещь — другое решение"}
                    <small>
                      {h.mode === "train" ? "Обучение" : "Проверка"} ·{" "}
                      {new Date(h.finished_at).toLocaleString("ru")}
                    </small>
                  </span>
                  <b>
                    {h.result.score}/100 ·{" "}
                    {h.result.passed ? "Зачёт" : "Незачёт"}
                  </b>
                  <ChevronRight />
                </button>
              ))}
              <h2>Короткие упражнения</h2>
              <p className="muted">
                Сохраняются отдельно. Не меняют оценки смен, компетенции и
                рейтинг.
              </p>
              {!progress.practice_history?.length && (
                <p>
                  Упражнения появятся после отработки ошибок из разбора смены.
                </p>
              )}
              {progress.practice_history?.map((item) => (
                <button
                  className="history"
                  key={item.id}
                  disabled={busy}
                  onClick={() => openAttempt(item.id)}
                >
                  <span>
                    {item.title}
                    <small>
                      {new Date(item.finished_at).toLocaleString("ru")}
                    </small>
                  </span>
                  <b>{item.passed ? "Выполнено" : "Стоит повторить"}</b>
                  <ChevronRight />
                </button>
              ))}
            </section>
          )}
          {page === "ranking" && (
            <section className="results">
              <h1>Рейтинг</h1>
              <p className="lead">
                Лучшие результаты проверок и действующие временные баллы.
              </p>
              <div className="tabs">
                {[
                  ["brigade", "Моя бригада"],
                  ["depot", "Моё депо"],
                  ["company", "Компания"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={scope === id ? "active" : ""}
                    onClick={() => setScope(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="rank-list">
                {ranks.map((r) => (
                  <div
                    key={r.id}
                    className={r.id === me.profile.id ? "self" : ""}
                  >
                    <b>{r.rank}</b>
                    <span>
                      <strong>
                        {r.name}
                        {r.id === me.profile.id ? " · Вы" : ""}
                      </strong>
                      <small>
                        {r.brigade} · {r.depot}
                        {r.demo ? " · Пример" : ""}
                      </small>
                    </span>
                    <strong>{r.total}</strong>
                  </div>
                ))}
              </div>
              <p className="footnote">
                Имена, бригады и депо в этой версии вымышлены.
              </p>
            </section>
          )}
          {page === "notifications" && (
            <section className="results">
              <h1>Уведомления</h1>
              {notices.map((n) => (
                <button
                  className={"notice " + (n.read ? "read" : "")}
                  key={n.id}
                  onClick={() =>
                    void run(async () => {
                      await api("/notifications/" + n.id, "PATCH", {});
                      setNotices((old) =>
                        old.map((x) =>
                          x.id === n.id ? { ...x, read: true } : x,
                        ),
                      );
                      setPage(n.target);
                    })
                  }
                >
                  <Bell />
                  <span>
                    {n.title}
                    <small>{n.body}</small>
                    <small>{n.read ? "Прочитано" : "Новое"}</small>
                  </span>
                  <ChevronRight />
                </button>
              ))}
            </section>
          )}
          {page === "profile" && (
            <section className="results">
              <h1>Профиль</h1>
              <p className="lead">
                Используйте псевдоним. Для демо не нужны персональные данные.
              </p>
              <label>
                Псевдоним
                <input
                  value={name}
                  maxLength={40}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Портрет
                <select
                  value={portrait}
                  onChange={(e) => setPortrait(e.target.value)}
                >
                  <option value="conductor_card">Проводник</option>
                  <option value="chief_card">Начальник поезда</option>
                </select>
              </label>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    setMe(await api<Me>("/me", "PATCH", { name, portrait }));
                    setPage("scenarios");
                  })
                }
              >
                Сохранить
              </button>
              <p>
                {me.profile.brigade} · Депо {me.profile.depot} ·
                Демонстрационные данные
              </p>
              <small>Номер профиля: {me.profile.id}</small>
              <p className="footnote">
                Профиль доступен в этом браузере. После очистки данных сайта или
                30 дней без входа восстановление не предусмотрено.
              </p>
            </section>
          )}
        </main>
      </div>
      {activeConflict && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="active-attempt-title"
            aria-describedby="active-attempt-description"
          >
            <h2 id="active-attempt-title">Есть незавершённое прохождение</h2>
            <p id="active-attempt-description">
              Вы уже начали смену или упражнение. Продолжите его или завершите
              на его экране, а затем выберите новое.
            </p>
            <p>Ваши решения сохранены.</p>
            <div className="game-tools">
              <button
                className="primary"
                disabled={busy}
                onClick={() => {
                  const id = activeConflict;
                  setActiveConflict(null);
                  openAttempt(id);
                }}
              >
                Продолжить прохождение
              </button>
              <button disabled={busy} onClick={() => setActiveConflict(null)}>
                Остаться на этой странице
              </button>
            </div>
          </section>
        </div>
      )}
      {selected && !activeConflict && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Подготовка к смене"
          >
            <button className="back" onClick={() => setSelected(null)}>
              <ArrowLeft size={18} />
              Назад
            </button>
            <h1>
              {mode === "check"
                ? (selected.check?.title ?? selected.title)
                : selected.title}
            </h1>
            <p>
              {mode === "check"
                ? (selected.check?.intro ?? selected.intro)
                : selected.intro}
            </p>
            <div className="tabs">
              <button
                className={mode === "train" ? "active" : ""}
                onClick={() => setMode("train")}
              >
                Обучение
              </button>
              <button
                className={mode === "check" ? "active" : ""}
                onClick={() => setMode("check")}
              >
                Проверка
              </button>
            </div>
            <p>
              {mode === "train"
                ? "Подсказки и пауза доступны. Без рейтинговых баллов."
                : "Без подсказок и паузы. Сроки продолжаются при закрытии браузера."}
            </p>
            {mode === "check" && (
              <p className="footnote">
                Для честного сравнения результатов проверка использует
                закреплённую версию {selected.check?.version ?? "1"}.
              </p>
            )}
            {mode === "train" && selected.id === "service" && (
              <label>
                Вариант ситуации
                <select
                  value={String(seat)}
                  onChange={(e) => setSeat(e.target.value === "true")}
                >
                  <option value="true">Свободное место есть</option>
                  <option value="false">Свободных мест нет</option>
                </select>
              </label>
            )}
            <p className="footnote">
              Срок появится вместе с задачей. Время и штрафы — настройки учебной
              модели.
            </p>
            <button disabled={busy} className="primary" onClick={start}>
              <Play size={18} />
              Начать смену
            </button>
          </section>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
