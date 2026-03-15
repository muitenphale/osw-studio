import { ProjectTemplate } from '../../project-templates';
import { PYTHON_DOMAIN_PROMPT } from '@/lib/llm/prompts/python';

export const PYTHON_STARTER_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'Starter (Python)',
  description: 'Minimal Python script with Pyodide (browser-based CPython)',
  directories: [],
  files: [
    {
      path: '/main.py',
      content: `# Hello World — Python on Pyodide
# Edit this file and it will auto-execute in the Terminal panel.

def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("World"))
print()
print("Python is running in your browser via Pyodide.")
print("Try editing this file — it re-runs automatically on save.")
`
    },
    {
      path: '/.PROMPT.md',
      content: PYTHON_DOMAIN_PROMPT
    }
  ]
};
