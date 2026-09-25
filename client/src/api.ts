export type Scenario = {
  id: string;
  title: string;
  intro: string;
  version: string;
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
};
export type Progress = {
  permanent: number;
  bonus: number;
  total: number;
  level: number;
  awards: { id: number; title: string }[];
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
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api/v1" + path, {
    method,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-TOKEN": csrf,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      data.error?.message || data.message || "Не удалось выполнить запрос",
      data.state,
    );
  if (data.csrf) csrf = data.csrf;
  return data as T;
}
