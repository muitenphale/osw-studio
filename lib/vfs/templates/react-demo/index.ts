import { ProjectTemplate } from '../../project-templates';
import { REACT_DOMAIN_PROMPT } from '@/lib/llm/prompts/react';
import { templateStylesheet } from '../theme';
import { TEMPLATE_STYLE_PROMPT } from '../style-prompt';

export const REACT_DEMO_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'To-do List',
  description: 'A personal checklist that remembers itself between visits, kept in the browser it was written in',
  directories: ['/src', '/src/components'],
  files: [
    {
      path: '/index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>To-do list</title>
    <link rel="stylesheet" href="/bundle.css">
</head>
<body>
    <div id="root"></div>
    <script type="module" src="/bundle.js"></script>
</body>
</html>`
    },
    {
      path: '/src/main.tsx',
      content: `import { createRoot } from "react-dom/client";
import App from "./App";
import "./App.css";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
`
    },
    {
      path: '/src/storage.ts',
      content: `/*
 * Where the list lives. Kept out of the components so the reading and writing
 * can be read, and changed, in one place.
 */

export interface Task {
  id: number;
  text: string;
  done: boolean;
}

/*
 * localStorage is shared by everything on one origin, and two lists published
 * from this template land on the same host. Scoping the key to the page's own
 * path keeps them apart; without it, publishing a second list silently
 * overwrites the first.
 */
export const STORAGE_KEY = "osw-todo:" + window.location.pathname;

/** The stored list, or null when there is nothing stored yet. */
export function loadTasks(): Task[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    // Anything that is not a task is dropped rather than rendered as a blank
    // row: this is text off the disk, and a half-written key survives a crash.
    return parsed.filter(isTask);
  } catch {
    // Unparseable, or storage is unavailable. Either way there is no list.
    return null;
  }
}

/** Returns false when the browser refused to store it, which the page reports. */
export function saveTasks(tasks: Task[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    return true;
  } catch {
    // Private windows, a full quota, and storage turned off all arrive here.
    return false;
  }
}

function isTask(value: unknown): value is Task {
  if (typeof value !== "object" || value === null) return false;
  const task = value as Record<string, unknown>;
  return (
    typeof task.id === "number" &&
    typeof task.text === "string" &&
    typeof task.done === "boolean"
  );
}
`
    },
    {
      path: '/src/App.tsx',
      content: `import { useEffect, useRef, useState } from "react";
import { TaskForm } from "./components/TaskForm";
import { TaskItem } from "./components/TaskItem";
import { loadTasks, saveTasks, type Task } from "./storage";

// Only used the first time this list is opened. Once anything is stored, the
// stored list wins, including an empty one: a list you cleared should stay
// cleared rather than refilling itself with examples on the next visit.
const seed: Task[] = [
  { id: 1, text: "Try editing this task", done: false },
  { id: 2, text: "Add a new task below", done: false },
  { id: 3, text: "Check this one off", done: true },
];

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks() ?? seed);
  const [storageFailed, setStorageFailed] = useState(false);
  const firstRender = useRef(true);

  // Writes on every change, including the delete that empties the list. The
  // first render is skipped so opening the page does not write the seed over
  // storage that is only temporarily unreadable.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setStorageFailed(!saveTasks(tasks));
  }, [tasks]);

  const nextId = () => Math.max(0, ...tasks.map(t => t.id)) + 1;

  const addTask = (text: string) =>
    setTasks(prev => [...prev, { id: nextId(), text, done: false }]);

  const toggleTask = (id: number) =>
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));

  const deleteTask = (id: number) =>
    setTasks(prev => prev.filter(t => t.id !== id));

  const remaining = tasks.filter(t => !t.done).length;

  return (
    <>
      <header className="wrap site-head">
        <span className="brand">To-do <em>list</em></span>
        <span className="tag">{remaining} left</span>
      </header>

      <div className="wrap">
        <TaskForm onAdd={addTask} />

        {storageFailed && (
          <p className="notice">
            <span className="bar" />
            <span>
              This browser will not let the page save, so the list is only here until you
              close the tab. A private window or full storage is the usual reason.
            </span>
          </p>
        )}

        {tasks.length === 0 ? (
          <div className="list">
            <div className="empty">
              <h3>Nothing on the list</h3>
              <p>Add something above. It will still be here next time you open this page.</p>
            </div>
          </div>
        ) : (
          <ul className="list">
            {tasks.map(task => (
              <TaskItem
                key={task.id}
                task={task}
                onToggle={toggleTask}
                onDelete={deleteTask}
              />
            ))}
          </ul>
        )}

        <p className="faint where">
          Saved in this browser only. It is not sent anywhere, so it will not follow you to
          another device, and clearing site data clears it.
        </p>
      </div>
    </>
  );
}
`
    },
    {
      path: '/src/components/TaskForm.tsx',
      content: `import { useState } from "react";

interface Props {
  onAdd: (text: string) => void;
}

export function TaskForm({ onAdd }: Props) {
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText("");
  };

  return (
    <form className="add" onSubmit={handleSubmit}>
      <label className="field">
        <span>New task</span>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Something to do"
        />
      </label>
      {/* Disabled until there is something to add, so the button never looks
          like it failed to do anything. */}
      <button type="submit" className="btn btn-primary" disabled={!text.trim()}>Add</button>
    </form>
  );
}
`
    },
    {
      path: '/src/components/TaskItem.tsx',
      content: `import type { Task } from "../storage";

interface Props {
  task: Task;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
}

export function TaskItem({ task, onToggle, onDelete }: Props) {
  return (
    <li className={"list-item" + (task.done ? " done" : "")}>
      <label className="check">
        <input
          type="checkbox"
          checked={task.done}
          onChange={() => onToggle(task.id)}
        />
        <span className="lead">{task.text}</span>
      </label>
      <button
        type="button"
        className="filter"
        onClick={() => onDelete(task.id)}
      >
        Delete
      </button>
    </li>
  );
}
`
    },
    {
      path: '/src/App.css',
      content: `${templateStylesheet({ hue: 340 })}

/* Everything above is the shared theme, and the accent hue is the only thing
   this demo chose. What follows is the little the list needs on top of it. */

.wrap.site-head {
  padding: 0.85rem clamp(1.25rem, 4vw, 2.5rem);
}

/* The add row: one field taking the width, one button at the end of it. */
.add {
  display: flex;
  align-items: flex-end;
  gap: 0.6rem;
  margin-bottom: 1.5rem;
}

.add .field {
  flex: 1;
}

/* .list is styled for rows of its own, so the <ul> only has to stop being one. */
ul.list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.check {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
}

.check input {
  accent-color: var(--accent);
  width: 1rem;
  height: 1rem;
}

/* Where the list lives, said once at the bottom rather than in a banner. It is
   the kind of thing you want to be able to find, not to be told repeatedly. */
.where {
  margin-top: 1.25rem;
  font-size: 0.8125rem;
  max-width: 52ch;
}

#root > .wrap > .notice {
  margin-bottom: 1.25rem;
}

/* Struck through in the semantic green rather than the accent: the line means
   done, and done is not this template's brand colour. */
.list-item.done .lead {
  text-decoration: line-through;
  text-decoration-color: var(--ok);
  color: var(--ink-soft);
}
`
    },
    {
      path: '/.PROMPT.md',
      content: `${REACT_DOMAIN_PROMPT}

---

# This project: a to-do list that remembers itself

Three components and one piece of state, kept small on purpose so the wiring is readable: \`App\`
holds the task array, \`TaskForm\` reports a new task upward, \`TaskItem\` reports a toggle or a
delete upward. State lives in one place and changes travel down as props.

## Where the list is kept

\`localStorage\`, through \`/src/storage.ts\`. \`App\` reads it once when it mounts and writes on every
change. Four things about that are deliberate:

- **The key is scoped to the page's path** (\`osw-todo:/some/path\`). localStorage belongs to the
  origin, not the page, so two lists published from this template to the same host would otherwise
  share one key and overwrite each other. One consequence to know about: inside the editor preview
  every project's path is \`srcdoc\`, so two projects made from this template share a list while you
  are previewing them. Published, they do not. The page has no way to know which project it is, so
  this is a limit rather than a bug to fix.
- **Stored beats seed, including an empty list.** The three example tasks appear only when nothing
  has ever been stored. A list somebody cleared stays cleared instead of refilling with examples.
- **The first render does not write.** Otherwise opening the page would put the seed over storage
  that was only briefly unreadable.
- **A refused write is reported, not swallowed.** Private windows, a full quota and storage turned
  off all make \`saveTasks\` return false, and the page says the list will not survive the tab. Keep
  that: silently dropping what somebody typed is the worst version of this.

**This is one browser, and only one.** It does not sync, it cannot be shared, and clearing site data
clears it. The page says so at the bottom; leave that line in, or replace it with something equally
plain. If the user wants a list that follows them between devices, that is Server Mode and a
database, which is a different project shape, so say so rather than reaching for \`localStorage\`
harder.

## Where the styling comes from

\`/src/App.css\` is the shared template theme followed by a short tail. The theme is generated, so the
only thing to change up there is the accent hue, currently 340. The classes the components use
(\`.list\`, \`.list-item\`, \`.field\`, \`.btn\`, \`.tag\`, \`.empty\`, \`.notice\`) all come from it, so a new
component usually needs no new CSS at all.

${TEMPLATE_STYLE_PROMPT}
`
    }
  ]
};
