"""Prepare a reproducible, secret-free submission from the committed repository."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "tmp/submission/Виртуальная смена ВСМ — сдача 26.09.2026"


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT).decode("utf-8").strip()


def main() -> None:
    if git("status", "--porcelain"):
        raise SystemExit("Commit the reviewed changes before preparing the submission.")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    revision = git("rev-parse", "HEAD")
    sections = re.findall(
        r"^## [^\n]+\n(.*?)(?=^## |\Z)",
        (ROOT / "docs/submission.md").read_text(encoding="utf-8"),
        re.M | re.S,
    )
    if len(sections) != 5:
        raise SystemExit("Expected exactly five submission sections.")
    fields = {
        "repository": "https://github.com/proger89/test123334",
        "prototype": "https://185.173.147.205/",
        "architecture": sections[2].strip().replace("`", ""),
        "api_flow": sections[3].strip().replace("`", ""),
        "limits": sections[4].split("Этот файл подготовлен")[0].strip(),
    }
    if any(len(value) > 2000 for value in fields.values()):
        raise SystemExit("A submission field exceeds the form's 2000-character limit.")
    # Used by the browser to fill exactly the same text as the delivery copy.
    (ROOT / "tmp/submission-fields.json").write_text(
        json.dumps(fields, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    labels = ["1. Репозиторий", "2. Рабочий прототип", "3. Архитектура", "4. API и путь пользователя", "5. Ограничения и развитие"]
    answers = "\n\n".join(label + "\n\n" + value for label, value in zip(labels, fields.values()))
    (OUTPUT / "01_Ответы_для_формы.txt").write_text(answers + "\n", encoding="utf-8-sig")
    (OUTPUT / "00_Начните_здесь.txt").write_text(
        "ВИРТУАЛЬНАЯ СМЕНА ВСМ\nКомплект для сдачи, 26 сентября 2026 года\n\n"
        f"Версия кода: {revision}\n"
        "Сайт: https://185.173.147.205/\n"
        "Репозиторий: https://github.com/proger89/test123334\n"
        "Материалы: https://disk.yandex.ru/d/kjXwaeWpAfAmiw\n\n"
        "01 — тексты для пяти полей формы. Решение через сайт организаторов не отправлено.\n"
        "02 — исходный код с графикой и файлами Docker. Распакуйте VSM, запустите Docker Desktop и откройте терминал в папке VSM. Для Windows используйте PowerShell 7.6.6; на этой версии команда подтвердила запуск. Выполните по очереди:\n\ndocker compose -f compose.setup.yaml run --rm setup\ndocker compose pull db\ndocker compose build api web\ndocker compose up --no-build -d --wait web worker\n\nОткройте http://127.0.0.1:8180. Подробности — в README.md.\n"
        "03 — документация: архитектура и схемы, OpenAPI, путь пользователя, проверки, сценарий защиты, ограничения и описание использования ИИ.\n"
        "04 и 05 — техническое задание в PDF и DOCX. Дополнения по интерфейсу и редактору находятся в документации.\n"
        "06 — версия кода, размеры и контрольные суммы файлов.\n\n"
        "Играть можно без регистрации. Для редактора нужен код методиста: при локальном запуске он создаётся в .env. Серверный код доступа в комплект не включён; на защите редактор можно показать с компьютера команды.\n"
        "После сборки игра работает без внешних API. База и личные результаты в комплект не входят.\n",
        encoding="utf-8-sig",
    )
    for filename, paths in [
        ("02_Исходный_код.zip", []),
        ("03_Документация.zip", ["docs", "README.md", "AI_USAGE.md"]),
    ]:
        git("archive", "--format=zip", "--prefix=VSM/", "-o", str(OUTPUT / filename), revision, *paths)
        verify_archive(OUTPUT / filename)
    for suffix, title in [("pdf", "04"), ("docx", "05")]:
        shutil.copyfile(ROOT / f"docs/VSM_TZ_v4_1.{suffix}", OUTPUT / f"{title}_Техническое_задание.{suffix}")
    files = []
    for path in sorted(OUTPUT.iterdir()):
        if path.name == "06_Проверка_комплекта.json":
            continue
        files.append({"file": path.name, "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    (OUTPUT / "06_Проверка_комплекта.json").write_text(
        json.dumps({"commit": revision, "files": files}, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"directory": str(OUTPUT), "files": len(files) + 1, "field_lengths": {key: len(value) for key, value in fields.items()}}, ensure_ascii=False))


def verify_archive(path: Path) -> None:
    secrets = []
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8-sig").splitlines():
            key, separator, value = line.partition("=")
            if separator and key in {"APP_KEY", "DB_PASSWORD", "EDITOR_ACCESS_CODE"} and len(value) >= 12:
                secrets.append(value.encode())
    with zipfile.ZipFile(path) as archive:
        if archive.testzip() is not None:
            raise SystemExit("Archive integrity check failed.")
        for entry in archive.infolist():
            parts = Path(entry.filename).parts
            if any(part in {".env", ".editor-access.txt", "node_modules", "vendor", "runtime", "tmp", ".git"} for part in parts):
                raise SystemExit(f"Excluded path in archive: {entry.filename}")
            data = archive.read(entry)
            if any(secret in data for secret in secrets) or re.search(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----", data):
                raise SystemExit(f"Secret found in archive: {entry.filename}")


if __name__ == "__main__":
    main()
