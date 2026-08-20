import { readBoard, listProjects, summarise } from '../db/board.ts';
import { getDatabase } from '../db/client.ts';
import { createLogger } from '../observability/log.ts';
import { readFreeze } from '../orchestrator/freeze.ts';
import { FreezeBanner } from '../ui/freeze-banner.tsx';
import { LiveFeed } from '../ui/live-feed.tsx';
import { MILESTONE_STATUS_RU, PROJECT_STATUS_RU, RU, TASK_STATUS_RU } from '../ui/strings.ts';

/**
 * The dashboard (task 153).
 *
 * Rendered on the server from the database, so the first byte already carries the state of the run:
 * the cold-start bound in the task is about an operator opening the page after a restart and seeing
 * **the loop's state**, not a spinner that will fetch it. Only the feed is a client component, and
 * only because a live stream has to be.
 */
export const dynamic = 'force-dynamic';

const FEED_TAIL = 200;

export default function DashboardPage() {
  const database = getDatabase();
  const projects = listProjects(database);
  const current = projects[0];

  if (current === undefined) {
    return (
      <>
        <Masthead />
        <section className="panel">
          <h2>{RU.emptyTitle}</h2>
          <p className="empty">{RU.emptyBody}</p>
        </section>
      </>
    );
  }

  const board = readBoard(database, current.projectId);
  if (board === null) throw new Error(`проект ${current.projectId} исчез между двумя запросами`);

  const counts = summarise(board);
  const tail = createLogger(database).tail(board.projectId, FEED_TAIL);

  /*
   * The freeze is read from **disk**, not from the project's row (task 160). The marker is what
   * survives a restart and what refuses to resume, so a dashboard that showed the row's status
   * instead would be showing an index of the truth rather than the truth — and the two differ for
   * exactly as long as it takes a recovery to run.
   */
  const freeze = board.workspaceDir === null ? null : readFreeze(board.workspaceDir);

  return (
    <>
      <Masthead />

      {freeze !== null && (
        <FreezeBanner
          reason={freeze.reason}
          taskId={freeze.taskId}
          pausedCount={freeze.paused.length}
          workspaceDir={board.workspaceDir}
        />
      )}

      <p className="meta" data-testid="project-line">
        {RU.project}: <strong data-testid="project-title">{board.title}</strong>{' '}
        <span className="badge" data-status={board.status}>
          {PROJECT_STATUS_RU[board.status]}
        </span>{' '}
        · {RU.totals}: <span data-testid="task-total">{counts.total}</span> · {RU.cold}
      </p>

      <div className="columns">
        <section className="panel" aria-label={RU.milestones}>
          <h2>{RU.milestones}</h2>

          <ul className="tree">
            {board.milestones.map((milestone) => (
              <li key={milestone.milestoneId} data-testid="milestone">
                <span className="row-title">{milestone.title}</span>{' '}
                <span className="badge" data-status={milestone.status}>
                  {MILESTONE_STATUS_RU[milestone.status]}
                </span>
                <div className="meta">
                  {milestone.dependsOn.length === 0
                    ? RU.noDependencies
                    : `${RU.dependsOn}: ${milestone.dependsOn.join(', ')}`}
                </div>
                <ul className="tasks">
                  {milestone.tasks.map((task) => (
                    <li key={task.taskId} data-testid="task" data-task-id={task.taskId}>
                      <span className="row-title">{task.title}</span>
                      <span className="badge" data-status={task.status}>
                        {TASK_STATUS_RU[task.status]}
                      </span>
                      <span className="meta">
                        {RU.techStack}: {task.techStack}
                        {task.dependsOn.length > 0 &&
                          ` · ${RU.dependsOn}: ${task.dependsOn.join(', ')}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel" aria-label={RU.feed}>
          <h2>{RU.feed}</h2>
          <LiveFeed projectId={board.projectId} initial={tail} />
        </section>
      </div>
    </>
  );
}

function Masthead() {
  return (
    <header className="masthead">
      <h1>{RU.title}</h1>
      <span className="sub">{RU.subtitle}</span>
    </header>
  );
}
