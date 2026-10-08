import { Route, Switch } from 'wouter';
import { Login } from './screens/Login';
import { Settings } from './screens/Settings';
import { TaskForm } from './screens/TaskForm';
import { Tasks } from './screens/Tasks';
import { Today } from './screens/Today';
import { Trash } from './screens/Trash';
import { useStore } from './store';
import { BottomNav } from './ui';

export function App({ update }: { update: (() => void) | null }) {
  const { state, error, t, refresh } = useStore();

  let body;
  if (error === 'auth') body = <Login />;
  else if (!state)
    body = (
      <div className="center">
        {error === 'net' ? (
          <>
            <div>{t.errorGeneric}</div>
            <button type="button" className="chip outline" onClick={refresh}>
              {t.retry}
            </button>
          </>
        ) : (
          t.loading
        )}
      </div>
    );
  else
    body = (
      <Switch>
        <Route path="/tasks/new">
          <TaskForm />
        </Route>
        <Route path="/tasks/:id">{(p) => <TaskForm key={p.id} id={Number(p.id)} />}</Route>
        <Route path="*">
          <Switch>
            <Route path="/tasks" component={Tasks} />
            <Route path="/trash" component={Trash} />
            <Route path="/settings" component={Settings} />
            <Route component={Today} />
          </Switch>
          <BottomNav />
        </Route>
      </Switch>
    );

  return (
    <div className="app">
      {body}
      {update && (
        <div className="update" role="status">
          <span>{t.updateReady}</span>
          <button type="button" onClick={update}>
            {t.updateNow}
          </button>
        </div>
      )}
    </div>
  );
}
