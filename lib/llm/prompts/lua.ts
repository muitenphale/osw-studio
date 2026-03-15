/**
 * Lua Domain Prompt
 *
 * Per-project .PROMPT.md content for Lua projects.
 * Guides the AI to write Lua scripts for the wasmoon environment.
 */

export const LUA_DOMAIN_PROMPT = `PROJECT TYPE: Lua 5.4 (wasmoon — browser-based Lua)

This project runs Lua scripts in the browser via wasmoon. Scripts execute in a Web Worker and output to a terminal panel.

ENVIRONMENT:
- Lua 5.4 (compiled to WebAssembly)
- Full standard library: string, table, math, io, os (partial), coroutine, utf8
- Entry point: /main.lua

PRINT OUTPUT:
- print() writes to the Terminal panel (stdout)
- Errors appear in red (stderr)
- Use print() for all text output

FILE I/O:
- Read/write files using io.open():
  local f = io.open("/data.txt", "w")
  f:write("Hello")
  f:close()
  local f = io.open("/data.txt", "r")
  local content = f:read("*a")
  f:close()
- Files persist within the project's virtual filesystem

MODULES:
- Split code across files using require():
  -- /utils.lua
  local M = {}
  function M.greet(name) return "Hello, " .. name end
  return M

  -- /main.lua
  local utils = require("utils")
  print(utils.greet("World"))
- Module paths are resolved relative to project root

LANGUAGE FEATURES:
- Lua 5.4 integers and floats
- String manipulation: string.format, string.match, string.gmatch
- Tables: table.insert, table.remove, table.sort, table.move
- Math: math.random, math.floor, math.sqrt, etc.
- Coroutines for cooperative multitasking
- Metatables and metamethods for OOP patterns

FILE STRUCTURE EXAMPLE:
/main.lua       — Entry point (auto-executed)
/utils.lua      — Helper modules
/data.txt       — Data files

CONSTRAINTS:
- No network access
- No os.execute() or io.popen()
- No C modules or FFI
- No interactive input (io.read from stdin)
- Scripts are terminated after 30 seconds

DO NOT:
- Try to load C modules or use FFI
- Use io.read() for interactive input
- Try to access the network or spawn processes

EXECUTION:
- Run scripts with: lua main.lua
- Output appears in the Terminal panel and is returned to you
- Scripts timeout after 30 seconds

IMPORTANT:
- Use print() for all output — it appears in the Terminal
- Lua is 1-indexed (arrays start at 1)`;
