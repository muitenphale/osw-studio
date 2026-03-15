import { ProjectTemplate } from '../../project-templates';
import { LUA_DOMAIN_PROMPT } from '@/lib/llm/prompts/lua';

export const LUA_STARTER_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'Starter (Lua)',
  description: 'Minimal Lua script with wasmoon (browser-based Lua 5.4)',
  directories: [],
  files: [
    {
      path: '/main.lua',
      content: `-- Hello World — Lua 5.4 on wasmoon
-- Edit this file and it will auto-execute in the Terminal panel.

local function greet(name)
    return string.format("Hello, %s!", name)
end

print(greet("World"))
print()
print("Lua is running in your browser via wasmoon.")
print("Try editing this file — it re-runs automatically on save.")
`
    },
    {
      path: '/.PROMPT.md',
      content: LUA_DOMAIN_PROMPT
    }
  ]
};
