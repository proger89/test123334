import type { Attempt } from "../api";
export type Action = {
  id: string;
  label: string;
  explanation: string;
  source: string;
  next?: string;
  open?: string;
  loyalty?: number;
  safety?: number;
  when?: Record<string, boolean>;
  flags?: Record<string, boolean>;
  checks?: Record<string, boolean>;
  critical?: boolean;
  close_timer?: boolean;
};
export type Definition = {
  id: "service" | "security";
  version: string;
  title: string;
  intro: string;
  seconds: number;
  critical_timeout: boolean;
  initial: Record<string, string>;
  rubric: Record<
    string,
    { label: string; competency: string; default?: boolean }
  >;
  nodes: Record<string, { text: string; actions: Action[] }>;
};
export type Draft = {
  id: string;
  base_version: string;
  revision: number;
  published_version: string | null;
  definition: Definition;
  issues: string[];
};
export type Library = {
  versions: {
    scenario: string;
    version: string;
    title: string;
    ranked: boolean;
  }[];
  drafts: { id: string; title: string; published_version: string | null }[];
};
export type Preview = Pick<
  Attempt,
  | "id"
  | "title"
  | "revision"
  | "server_time"
  | "status"
  | "deadline"
  | "remaining"
  | "threads"
  | "loyalty"
  | "safety"
  | "last_decision"
  | "result"
>;
export const flags: Record<string, string> = {
  seat: "Есть свободное место того же класса",
  reported: "О неисправности сообщили",
  promise: "Обещали неподтверждённый ремонт",
  owner: "Владелец багажа установлен",
  delayed: "Решение отложено",
  vague: "Дан неопределённый ответ",
  notified: "Ответственные за безопасность уведомлены",
  warned: "Пассажиры предупреждены",
};
export const threadLabels: Record<string, string> = {
  service: "Розетка",
  baggage: "Багаж в проходе",
  security: "Багаж без владельца",
};
export function newAction(): Action {
  return {
    id: "action_" + Math.random().toString(36).slice(2, 10),
    label: "",
    explanation: "",
    source: "",
    next: "closed_resolved",
  };
}
