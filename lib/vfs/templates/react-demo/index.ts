import { ProjectTemplate } from '../../project-templates';
import { REACT_DOMAIN_PROMPT } from '@/lib/llm/prompts/react';

export const REACT_DEMO_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'React Demo',
  description: 'Interactive task tracker showcasing React components, state, and props',
  directories: ['/src', '/src/components'],
  files: [
    {
      path: '/index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Task Tracker</title>
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
      path: '/src/App.tsx',
      content: `import { useState } from "react";
import { TaskForm } from "./components/TaskForm";
import { TaskItem } from "./components/TaskItem";

interface Task {
  id: number;
  text: string;
  done: boolean;
}

const initial: Task[] = [
  { id: 1, text: "Try editing this task", done: false },
  { id: 2, text: "Add a new task below", done: false },
  { id: 3, text: "Check this one off", done: true },
];

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(initial);
  const nextId = () => Math.max(0, ...tasks.map(t => t.id)) + 1;

  const addTask = (text: string) =>
    setTasks(prev => [...prev, { id: nextId(), text, done: false }]);

  const toggleTask = (id: number) =>
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));

  const deleteTask = (id: number) =>
    setTasks(prev => prev.filter(t => t.id !== id));

  const remaining = tasks.filter(t => !t.done).length;

  return (
    <div className="app">
      <header>
        <h1>Task Tracker</h1>
        <span className="badge">{remaining} remaining</span>
      </header>
      <TaskForm onAdd={addTask} />
      <ul className="task-list">
        {tasks.map(task => (
          <TaskItem
            key={task.id}
            task={task}
            onToggle={toggleTask}
            onDelete={deleteTask}
          />
        ))}
        {tasks.length === 0 && (
          <li className="empty">No tasks yet — add one above!</li>
        )}
      </ul>
    </div>
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
    <form className="task-form" onSubmit={handleSubmit}>
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Add a task..."
      />
      <button type="submit">Add</button>
    </form>
  );
}
`
    },
    {
      path: '/src/components/TaskItem.tsx',
      content: `interface Task {
  id: number;
  text: string;
  done: boolean;
}

interface Props {
  task: Task;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
}

export function TaskItem({ task, onToggle, onDelete }: Props) {
  return (
    <li className={"task-item" + (task.done ? " done" : "")}>
      <label>
        <input
          type="checkbox"
          checked={task.done}
          onChange={() => onToggle(task.id)}
        />
        <span>{task.text}</span>
      </label>
      <button className="delete" onClick={() => onDelete(task.id)}>
        \u00d7
      </button>
    </li>
  );
}
`
    },
    {
      path: '/src/App.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #f8fafc;
  color: #1e293b;
}

.app {
  max-width: 480px;
  margin: 3rem auto;
  padding: 0 1rem;
}

header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}

h1 { font-size: 1.5rem; }

.badge {
  font-size: 0.8rem;
  color: #64748b;
  background: #e2e8f0;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
}

.task-form {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.task-form input {
  flex: 1;
  padding: 0.55rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.15s;
}

.task-form input:focus { border-color: #6366f1; }

.task-form button {
  padding: 0.55rem 1rem;
  background: #6366f1;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.task-form button:hover { background: #4f46e5; }

.task-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.task-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.75rem;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  transition: opacity 0.15s;
}

.task-item label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  flex: 1;
}

.task-item.done { opacity: 0.5; }
.task-item.done span { text-decoration: line-through; }

.task-item .delete {
  background: none;
  border: none;
  font-size: 1.1rem;
  color: #94a3b8;
  cursor: pointer;
  padding: 0 0.25rem;
  line-height: 1;
}

.task-item .delete:hover { color: #ef4444; }

.empty {
  text-align: center;
  color: #94a3b8;
  padding: 2rem;
  font-size: 0.9rem;
}
`
    },
    {
      path: '/.PROMPT.md',
      content: REACT_DOMAIN_PROMPT
    }
  ]
};
