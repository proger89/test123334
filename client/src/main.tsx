import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  MessageCircle,
  ChartNoAxesColumn,
  Trophy,
  Bell,
  GraduationCap,
  ShieldCheck,
  Heart,
  Timer,
  Plug,
  BriefcaseBusiness,
  ChevronRight,
  Lightbulb,
  Pause,
  Play,
  LogOut,
  CheckCircle,
  AlertTriangle,
  User,
  ArrowLeft,
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
const threadName = (id: string) =>
  id === "service"
    ? "Розетка"
    : id === "baggage"
      ? "Багаж в проходе"
      : "Багаж без владельца";
function App() {
  const [me, setMe] = useState<Me | null>(null),
    [scenarios, setScenarios] = useState<Scenario[]>([]),
    [page, setPage] = useState("scenarios"),
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
    [hint, setHint] = useState(false),
    [name, setName] = useState(""),
    [portrait, setPortrait] = useState("conductor_card");
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
        setPage("game");
      }
    });
  }, []);
  useEffect(() => {
    if (!attempt || attempt.status === "completed") return;
    const id = setInterval(() => {
      api<Attempt>("/attempts/" + attempt.id)
        .then((a) => {
          accept(a);
          if (a.status === "completed") void refresh();
        })
        .catch((e) => setError(e.message));
    }, 1500);
    return () => clearInterval(id);
  }, [attempt?.id, attempt?.status]);
  useEffect(() => {
    if (!me) return;
    void run(async () => {
      if (page === "progress") setProgress(await api<Progress>("/me/progress"));
      if (page === "notifications")
        setNotices(await api<Notice[]>("/notifications"));
      if (page === "ranking")
        setRanks(await api<Rank[]>("/leaderboard?scope=" + scope));
    });
  }, [page, scope]);
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
          request_id: crypto.randomUUID(),
          expected_revision: attempt.revision,
          ...body,
        },
      );
      accept(a);
      setHint(false);
      if (a.status === "completed") await refresh();
    });
  const current =
    attempt?.threads.find((t) => t.id === thread) || attempt?.threads[0];
  const seconds =
    attempt?.deadline === null
      ? attempt?.remaining
      : Math.max(
          0,
          Math.ceil((attempt?.deadline ?? 0) - (attempt?.server_time ?? 0)),
        );
  const nav = [
    ["scenarios", "Сценарии", MessageCircle],
    ["progress", "Прогресс", ChartNoAxesColumn],
    ["ranking", "Рейтинг", Trophy],
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
            {notices.some((n) => !n.read) && <i />}
          </button>
          <button className="profile" onClick={() => setPage("profile")}>
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
          {error && (
            <div className="error" role="alert">
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
              {attempt && attempt.status !== "completed" && (
                <button className="primary" onClick={() => setPage("game")}>
                  <Play size={18} />
                  Продолжить смену
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
          {page === "game" && attempt && !attempt.result && (
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
                  <img
                    className="passenger"
                    src={img("passenger_card")}
                    alt="Пассажир"
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
                        <small>
                          {t.closed ? "Завершено" : "Ожидает решения"}
                        </small>
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
                <Gauge
                  label="Лояльность"
                  value={attempt.loyalty}
                  kind="loyalty"
                />
                <Gauge
                  label="Безопасность"
                  value={attempt.safety}
                  kind="safety"
                />
                <p className="footnote">
                  Учебная ситуация · время задано авторами тренажёра
                </p>
              </aside>
            </div>
          )}
          {page === "game" && attempt?.result && (
            <section className="results">
              <p className="eyebrow">
                Разбор смены ·{" "}
                {attempt.mode === "train" ? "Обучение" : "Проверка"}
              </p>
              <h1>
                {attempt.result.passed
                  ? "Смена пройдена"
                  : "Есть что отработать"}
              </h1>
              <div className="result-score">
                {attempt.result.passed ? <CheckCircle /> : <AlertTriangle />}
                <b>{attempt.result.score}/100</b>
                <span>
                  {attempt.result.passed ? "Зачёт" : "Незачёт"}
                  {attempt.result.critical ? " · Критическая ошибка" : ""}
                </span>
              </div>
              <p>
                {attempt.mode === "train"
                  ? "Это обучение: рейтинговые баллы не начисляются."
                  : "В рейтинг входит лучший зачтённый результат этой смены."}
              </p>
              <div className="competency-row">
                {Object.entries(attempt.result.competencies).map(([key, c]) => (
                  <div key={key}>
                    <strong>{key}</strong>
                    <p>
                      {c.percent === null
                        ? "Критическая ошибка"
                        : c.percent + "%"}
                    </p>
                  </div>
                ))}
              </div>
              <h2>Что получилось</h2>
              <div className="checklist">
                {Object.entries(attempt.result.rubric).map(([key, r]) => (
                  <p key={key}>
                    {attempt.result!.checks[key] ? (
                      <CheckCircle className="green" size={18} />
                    ) : (
                      <AlertTriangle className="orange" size={18} />
                    )}{" "}
                    {r.label}
                  </p>
                ))}
              </div>
              <h2>Решения и последствия</h2>
              {attempt.result.events.map((e, i) => (
                <article className="event" key={i}>
                  <span>{i + 1}</span>
                  <div>
                    <h3>{e.action}</h3>
                    <p>{e.explanation}</p>
                    <small>
                      {e.source} · Лояльность {e.loyalty} · Безопасность{" "}
                      {e.safety}
                    </small>
                  </div>
                </article>
              ))}
              <div className="game-tools">
                <button
                  className="primary"
                  onClick={() => {
                    setSelected(
                      scenarios.find((s) => s.id === attempt.scenario)!,
                    );
                    setMode("train");
                  }}
                >
                  Повторить обучение
                </button>
                <button onClick={() => setPage("progress")}>
                  Мой прогресс
                </button>
                <button onClick={() => setPage("scenarios")}>
                  Другие сценарии
                </button>
              </div>
              <p className="footnote">
                Результат учебной модели не является оценкой профессиональной
                пригодности. Полный алгоритм транспортной безопасности требует
                уточнения у заказчика.
              </p>
            </section>
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
                      {a.title}
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
              <h2>История смен</h2>
              {progress.history.map((h) => (
                <button
                  className="history"
                  key={h.id}
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
                Профиль сохраняется в этом браузере. После очистки данных сайта
                восстановление не предусмотрено.
              </p>
            </section>
          )}
        </main>
      </div>
      {selected && (
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
            <h1>{selected.title}</h1>
            <p>{selected.intro}</p>
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
              Таймер начнётся после запуска. Время и штрафы — настройки учебной
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
createRoot(document.getElementById("root")!).render(<App />);
