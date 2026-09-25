/** One request at a time; a sleeping tab does not accumulate requests. */
export function poll<T>(
  load: () => Promise<T>,
  interval: number,
  onError: (error: Error | null) => void,
  onValue: (value: T) => void = () => {},
) {
  let stopped = false,
    pending = false,
    timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(timer);
    if (!stopped && !document.hidden) timer = setTimeout(tick, interval);
  };
  async function tick() {
    if (stopped || pending || document.hidden) return;
    if (!navigator.onLine) {
      onError(
        new Error(
          "Нет связи. Данные обновятся, когда соединение восстановится.",
        ),
      );
      schedule();
      return;
    }
    pending = true;
    try {
      const value = await load();
      if (!stopped) {
        onValue(value);
        onError(null);
      }
    } catch (error) {
      if (!stopped)
        onError(
          error instanceof Error
            ? error
            : new Error("Не удалось обновить данные"),
        );
    } finally {
      pending = false;
      schedule();
    }
  }
  const wake = () => {
    clearTimeout(timer);
    void tick();
  };
  const offline = () => {
    if (!stopped)
      onError(
        new Error(
          "Нет связи. Данные обновятся, когда соединение восстановится.",
        ),
      );
  };
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", wake);
  window.addEventListener("offline", offline);
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", wake);
    window.removeEventListener("online", wake);
    window.removeEventListener("offline", offline);
  };
}
