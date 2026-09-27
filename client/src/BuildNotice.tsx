import { useEffect, useState } from "react";
import { poll } from "./poll";

declare const __BUILD_ID__: string;

export function BuildNotice({
  dirty,
  active,
}: {
  dirty: boolean;
  active: boolean;
}) {
  const [changed, setChanged] = useState(false);
  useEffect(
    () =>
      poll(
        async () => {
          const response = await fetch("/build.json", {
            cache: "no-store",
            signal: AbortSignal.timeout(10000),
          });
          if (!response.ok) throw new Error("Build unavailable");
          const value: unknown = await response.json();
          return typeof value === "object" &&
            value !== null &&
            "id" in value &&
            typeof value.id === "string"
            ? value.id
            : null;
        },
        30000,
        () => {},
        (id) => setChanged(id !== null && id !== __BUILD_ID__),
      ),
    [],
  );
  return (
    <aside className="build-notice">
      <small>Сборка: {__BUILD_ID__}</small>
      {changed && (
        <p role="status">
          Доступно обновление.{" "}
          {dirty ? (
            "Сначала сохраните изменения в редакторе."
          ) : active ? (
            "Завершите прохождение, затем обновите страницу."
          ) : (
            <button onClick={() => location.reload()}>Обновить страницу</button>
          )}
        </p>
      )}
    </aside>
  );
}
