export type Scenario = {
  id: string;
  title: string;
  intro: string;
  version: string;
  check?: { title: string; intro: string; version: string };
};
export type Result = {
  score: number;
  passed: boolean;
  critical: boolean;
  checks: Record<string, boolean>;
  rubric: Record<string, { label: string; competency: string }>;
  events: {
    action: string;
    explanation: string;
    source: string;
    loyalty: number;
    safety: number;
  }[];
  competencies: Record<string, { percent: number | null; status: string }>;
};
export type Attempt = {
  last_decision: {
    explanation: string;
    loyalty_change: number;
    safety_change: number;
  } | null;
  id: string;
  scenario: string;
  version: string;
  title: string;
  mode: "train" | "check";
  status: string;
  revision: number;
  server_time: number;
  loyalty: number;
  safety: number;
  deadline: number | null;
  remaining: number | null;
  threads: {
    id: string;
    text: string;
    closed: boolean;
    actions: { id: string; label: string }[];
  }[];
  result: Result | null;
  practice: {
    id: string;
    source_attempt_id: string;
    before: string[];
    intro: string;
    completed_steps: number;
  } | null;
  practice_options: PracticeRecommendation[];
};
export type PracticeRecommendation = {
  id: string;
  title: string;
  reason: string;
  before: string[];
};
export type Progress = {
  practice_focus: {
    label: string;
    scenario: string;
    version: string;
    mode: string;
    misses: number;
    observations: number;
    source_attempt_id: string;
    exercise_id: string | null;
  }[];
  practice_history: {
    id: string;
    title: string;
    passed: boolean;
    finished_at: string;
  }[];
  permanent: number;
  bonus: number;
  total: number;
  level: number;
  awards: { id: number; title: string; created_at: string }[];
  challenge: { completed_at: string | null; expires_at: string } | null;
  bonuses: { id: number; source: string; points: number; expires_at: string }[];
  competencies: {
    scenario: string;
    version: string;
    mode: string;
    name: string;
    critical: boolean;
    percent: number | null;
    attempts: number;
  }[];
  history: {
    id: string;
    scenario: string;
    mode: string;
    finished_at: string;
    result: Result;
  }[];
};
export type Me = {
  csrf?: string;
  profile: {
    id: string;
    name: string;
    portrait: string;
    brigade: string;
    depot: string;
  };
  progress: Progress;
  active_attempt: string | null;
};
export type Notice = {
  id: number;
  title: string;
  body: string;
  read: boolean;
  target: string;
};
export type Rank = {
  id: string;
  name: string;
  rank: number;
  total: number;
  permanent: number;
  brigade: string;
  depot: string;
  demo: boolean;
};
let csrf = "";
export class ApiError extends Error {
  constructor(
    message: string,
    public state?: Attempt,
    public code?: string,
    public activeAttemptId?: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  refreshSession = true,
): Promise<T> {
  const response = await fetch("/api/v1" + path, {
    method,
    signal: AbortSignal.timeout(15000),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-TOKEN": csrf,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new ApiError(
      "Нет связи с сервером. Проверьте соединение и повторите.",
    );
  });
  if (response.status === 419 && refreshSession) {
    // CSRF rejection happens before a command executes. Retry its original body once.
    await api<{ csrf: string }>("/session", "GET", undefined, false);
    return api<T>(path, method, body, false);
  }
  const data = await response.json().catch(() => {
    throw new ApiError("Сервер не ответил. Попробуйте ещё раз немного позже.");
  });
  if (!response.ok)
    throw new ApiError(
      response.status === 419
        ? "Время сеанса истекло. Обновите страницу."
        : response.status === 422
          ? data.errors?.name
            ? "Имя должно содержать от 2 до 40 знаков."
            : data.error?.message || "Проверьте введённые данные."
          : response.status === 401
            ? "Сеанс завершён. Обновите страницу, чтобы войти снова."
            : response.status === 403
              ? "Доступ закрыт. Проверьте код или откройте редактор заново."
              : response.status === 429
                ? "Слишком много запросов. Подождите немного и повторите."
                : response.status >= 500
                  ? "Сервис временно недоступен. Попробуйте ещё раз."
                  : data.error?.message || "Не удалось выполнить запрос",
      data.state,
      typeof data.error?.code === "string" ? data.error.code : undefined,
      typeof data.error?.active_attempt_id === "string"
        ? data.error.active_attempt_id
        : undefined,
    );
  if (data.csrf) csrf = data.csrf;
  return data as T;
}
