-- Составной первичный ключ задач и вех: `(project_id, task_id)` и `(project_id, milestone_id)`
-- (А-38 п.3; остаток D-325, продолжение D-324).
--
-- Пока проект в контуре жил один, `task_id TEXT PRIMARY KEY` был незаметен. Живой раунд А-37.1
-- предъявил цену: второй проект с такими же идентификаторами задач не заводил свои строки, а
-- ПЕРЕХВАТЫВАЛ чужие — и, поскольку `ON CONFLICT` намеренно не трогает `status` (D-261: статус живёт
-- на диске), новый план вступал в прогон С ЧУЖИМИ СТАТУСАМИ. Три задачи «уже приняты», одна
-- «заблокирована», тридцать секунд — и «принято 3 из 5» при пяти PENDING на диске и без единого
-- поднятого контейнера. Это лживая галочка в чистом виде, только источник её — индекс, а не модель.
--
-- Область идентификаторов (`ms_<проект>_01`, `WA_<проект>_01`) закрыла ЦЕЛЬНУЮ ветку и не закрывает
-- системную: идентификаторы бандла (`T001…`) приходят из чужого документа, и никакая наша нумерация
-- их не разведёт. Разводит схема. С этой миграции столкновение невозможно по построению, а не по
-- договорённости — и это же условие второго этапа (А-41в): один и тот же проект, открытый дважды,
-- обязан находить СВОИ строки, а не строки соседа с тем же именем задачи.
--
-- SQLite не умеет менять первичный ключ на месте, поэтому пять таблиц пересобираются целиком.
-- Порядок важен и он тут единственный безопасный: новые таблицы создаются от родителя к ребёнку,
-- данные переносятся, старые сносятся ОТ РЕБЁНКА К РОДИТЕЛЮ (иначе `ON DELETE CASCADE` старой схемы
-- выметет строки, которые мы переносим), и только потом идут переименования — при них SQLite сам
-- переписывает ссылки внешних ключей в остальных таблицах.

CREATE TABLE milestones_new (
    project_id TEXT NOT NULL,
    milestone_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    depends_on TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED')),
    PRIMARY KEY (project_id, milestone_id),
    FOREIGN KEY (project_id) REFERENCES projects (project_id) ON DELETE CASCADE
);

CREATE TABLE tasks_new (
    project_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    milestone_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    tech_stack TEXT NOT NULL
        CHECK (tech_stack IN ('nodejs', 'python', 'go', 'rust', 'generic')),
    files_to_edit TEXT NOT NULL,
    unit_test_cmd TEXT,
    e2e_test_cmd TEXT,
    expected_artifacts TEXT NOT NULL,
    depends_on TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'BLOCKED', 'PAUSED')),
    PRIMARY KEY (project_id, task_id),
    FOREIGN KEY (project_id, milestone_id)
        REFERENCES milestones_new (project_id, milestone_id) ON DELETE CASCADE
);

CREATE TABLE reports_new (
    report_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    executor_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED', 'BLOCKED')),
    tests_total INTEGER DEFAULT 0,
    tests_passed INTEGER DEFAULT 0,
    tests_failed INTEGER DEFAULT 0,
    errors TEXT,
    block_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id, task_id) REFERENCES tasks_new (project_id, task_id) ON DELETE CASCADE
);

CREATE TABLE agent_logs_new (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    task_id TEXT,
    agent_role TEXT NOT NULL,
    message TEXT NOT NULL,
    log_level TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects (project_id) ON DELETE CASCADE,
    FOREIGN KEY (project_id, task_id) REFERENCES tasks_new (project_id, task_id) ON DELETE CASCADE
);

CREATE TABLE agent_decisions_new (
    decision_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    task_id TEXT,
    title TEXT NOT NULL,
    rationale TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects (project_id) ON DELETE CASCADE,
    FOREIGN KEY (project_id, task_id) REFERENCES tasks_new (project_id, task_id) ON DELETE CASCADE
);

INSERT INTO milestones_new
    (project_id, milestone_id, title, description, depends_on, position, status)
SELECT project_id, milestone_id, title, description, depends_on, position, status FROM milestones;

-- Проект задачи выводится из её вехи — единственного места, где он до сих пор был записан.
INSERT INTO tasks_new
    (project_id, task_id, milestone_id, title, description, tech_stack, files_to_edit,
     unit_test_cmd, e2e_test_cmd, expected_artifacts, depends_on, position, status)
SELECT m.project_id, t.task_id, t.milestone_id, t.title, t.description, t.tech_stack,
       t.files_to_edit, t.unit_test_cmd, t.e2e_test_cmd, t.expected_artifacts, t.depends_on,
       t.position, t.status
FROM tasks t JOIN milestones m ON m.milestone_id = t.milestone_id;

INSERT INTO reports_new
    (report_id, project_id, task_id, executor_id, status, tests_total, tests_passed, tests_failed,
     errors, block_reason, created_at)
SELECT r.report_id, m.project_id, r.task_id, r.executor_id, r.status, r.tests_total,
       r.tests_passed, r.tests_failed, r.errors, r.block_reason, r.created_at
FROM reports r
JOIN tasks t ON t.task_id = r.task_id
JOIN milestones m ON m.milestone_id = t.milestone_id;

-- Строка ленты, чья задача до переноса не нашлась, сохраняется без задачи: лента — свидетельство,
-- и терять её из-за ссылки нельзя. То же для решений.
INSERT INTO agent_logs_new (log_id, project_id, task_id, agent_role, message, log_level, created_at)
SELECT l.log_id, l.project_id,
       (SELECT t.task_id FROM tasks_new t
        WHERE t.project_id = l.project_id AND t.task_id = l.task_id),
       l.agent_role, l.message, l.log_level, l.created_at
FROM agent_logs l;

INSERT INTO agent_decisions_new (decision_id, project_id, task_id, title, rationale, created_at)
SELECT d.decision_id, d.project_id,
       (SELECT t.task_id FROM tasks_new t
        WHERE t.project_id = d.project_id AND t.task_id = d.task_id),
       d.title, d.rationale, d.created_at
FROM agent_decisions d;

DROP TABLE agent_decisions;
DROP TABLE agent_logs;
DROP TABLE reports;
DROP TABLE tasks;
DROP TABLE milestones;

ALTER TABLE milestones_new RENAME TO milestones;
ALTER TABLE tasks_new RENAME TO tasks;
ALTER TABLE reports_new RENAME TO reports;
ALTER TABLE agent_logs_new RENAME TO agent_logs;
ALTER TABLE agent_decisions_new RENAME TO agent_decisions;

CREATE INDEX agent_logs_project_recent ON agent_logs (project_id, log_id DESC);
CREATE INDEX milestones_of_project ON milestones (project_id, position);
CREATE INDEX tasks_of_milestone ON tasks (project_id, milestone_id, position);
CREATE INDEX reports_of_task ON reports (project_id, task_id, created_at);
