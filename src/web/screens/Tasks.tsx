import { Link } from 'wouter';
import { useLoaded } from '../store';
import { Icon } from '../ui';
import { taskMeta } from './Today';

/** Todas las tareas agrupadas por zona, para editarlas. */
export function Tasks() {
  const { state, t } = useLoaded();
  const zones = [...state.zones.map((z) => ({ id: z.id as number | null, name: z.name })), { id: null, name: t.noZone }];
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

  return (
    <div className="screen">
      <div className="header">
        <h1>{t.tasks}</h1>
        <Link href="/tasks/new" className="fab" aria-label={t.newTask}>
          {Icon.plus()}
        </Link>
      </div>

      {state.tasks.length === 0 && (
        <div className="empty">
          <h2>{t.emptyTitle}</h2>
          <p>{t.emptyBody}</p>
        </div>
      )}

      {zones.map((z) => {
        const items = state.tasks.filter((x) => x.zone_id === z.id || (z.id === null && !state.zones.some((y) => y.id === x.zone_id))).sort(byName);
        if (!items.length) return null;
        return (
          <section key={z.id ?? 'none'} className="group">
            <div className="section-label">{z.name}</div>
            {items.map((x) => (
              <Link key={x.id} href={`/tasks/${x.id}`} className="task">
                <div className="task-main">
                  <div className="task-title">
                    <b>{x.name}</b>
                  </div>
                  <div className="task-meta">{taskMeta(x, t, state)}</div>
                </div>
                <span className={`c-${x.status}`}>{Icon.right()}</span>
              </Link>
            ))}
          </section>
        );
      })}
    </div>
  );
}
