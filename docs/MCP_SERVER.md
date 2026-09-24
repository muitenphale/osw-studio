# MCP Server

**Let an outside AI agent work on your projects.**

OSW Studio can expose its own MCP (Model Context Protocol) server, so a client like Claude Code, Claude Desktop or any other MCP-capable agent can work on a workspace the way you do in the app: projects and files, backend functions and tables, publishing, and analytics.

---

## Requirements

- **Server Mode.** The connector works against the workspaces and projects stored on the server. See [Server Mode](?doc=server-mode).
- **`MCP_ENABLED=true`** in the instance's environment. Without it the endpoint returns 404, as though the route does not exist.
- **An account with access to the workspace** you want to connect. What you can grant depends on your role in that workspace.

---

## Connecting a client

**Settings → MCP** shows the HTTP endpoint for this instance (`/api/mcp`) and a copy control. Add that URL to your MCP client as an **HTTP** server (not stdio, and not SSE). Most clients take it either through their own UI or as a line in a config file.

On a typical host it looks like:

```
https://your-osw-instance.com/api/mcp
```

```json
{
  "mcpServers": {
    "osw-studio": {
      "type": "http",
      "url": "https://your-osw-instance.com/api/mcp"
    }
  }
}
```

Running the studio locally, the URL is whatever you serve on:

```json
{
  "mcpServers": {
    "osw-studio": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp"
    }
  }
}
```

The desktop app serves on port `30011` by default, so use `http://localhost:30011/api/mcp` for that.

The URL has to be reachable **from wherever the client runs**. A `localhost` URL only works for a client on the same machine; to connect from elsewhere, publish the instance on a hostname the client can reach. See [VPS Deployment](?doc=vps-deployment).

You do not create an API key by hand:

1. The client makes its first call and gets a `401` with a pointer to this instance's authorization server.
2. It registers itself automatically and sends you to a consent screen.
3. On the consent screen you **pick one workspace** and **choose which scopes to allow**. You can allow fewer scopes than the client asked for.
4. Approving issues an access token to that client.

The consent screen shows the client's own name, so you can tell one connector from another when you have several.

You have to be signed in to approve. If you are not, you are sent to sign in and returned to the consent screen afterwards, with the client's request intact — including on a hosted instance, where signing in happens on the account site rather than on the instance itself. The request is held for ten minutes; leave it longer than that and the client has to ask again.

### What a grant covers

A grant is tied to **one workspace**. A client holding it cannot reach your other workspaces, even if your account is an instance admin. Every tool call checks the grant's workspace and your role in it.

A grant lasts only as long as the access it was approved under. Losing access to that workspace, or having the account deactivated, revokes it: the client's token stops working and it has to run through consent again if the access comes back. Deactivating an account revokes every grant it holds, across all its workspaces.

---

## Scopes

You can only grant scopes your own role allows.

| Scope | Minimum role | What it allows |
|---|---|---|
| `projects:read` | Viewer | See your projects and read their files |
| `projects:write` | Editor | Create projects, change their files, and edit backend functions, schedules and secret values |
| `agent` | Editor | Run the OSW Studio agent on a project and follow what it does |
| `deploy` | Editor | Create, publish and unpublish deployments, change their settings (analytics, database), and run SQL against their database. Does not delete a deployment. |
| `analytics` | Editor | Read the pageviews, visitors and top pages already collected for a deployment |

These five are the whole list. A scope outside it is ignored rather than granted, and a scope that once existed but no longer is (`workspace:admin`, which no tool reads) is refused outright with `invalid_scope`, so a client cannot end up holding a permission that means nothing.

---

## Tools

| Tool | Scope | What it does |
|---|---|---|
| `projects_list` | `projects:read` | The projects in a workspace, newest first (`limit`, 500 by default) |
| `projects_get` | `projects:read` | A project's settings and metadata |
| `projects_create` | `projects:write` | Start a project from a built-in template |
| `bash` | `projects:read` / `projects:write` | Run a command against a project's files |
| `backend_list` | `projects:read` | Edge functions, server functions, schedules and secret names (values are never returned) |
| `backend_upsert` | `projects:write` | Create or replace an edge function, server function, schedule or secret |
| `backend_delete` | `projects:write` | Remove an edge function, server function, schedule or secret by name |
| `agent_run` | `agent` | Ask the OSW Studio agent to work on a project |
| `agent_status` | `agent` | How a task is going, and what it has done |
| `agent_cancel` | `agent` | Stop a running task |
| `deployments_list` | `deploy` | The deployments in the workspace and their published state |
| `deployments_url` | `deploy` | Where a deployment is served, and whether a review password gates it |
| `deployments_create` | `deploy` | Create an unpublished deployment for a project |
| `deployments_update` | `deploy` | Set under-construction, analytics, or database |
| `deployments_publish` | `deploy` | Build a deployment and serve it |
| `deployments_unpublish` | `deploy` | Take the site off traffic, keeping the deployment and its data |
| `deployments_sql` | `deploy` | Run SQL against a deployment's runtime database (writes to system tables are refused) |
| `analytics_overview` | `analytics` | Pageviews, visitors and top pages for a deployment |

There is no tool to delete a project or a deployment (unpublish the deployment instead), to manage workspace members, or to change Connections / API keys. Secret values can be set through `backend_upsert` and are never returned.

### The `bash` tool

`bash` runs the commands the OSW Studio agent uses, against a project's virtual file system:

```
cat, head, tail, ls, tree, grep, rg, find, wc, sort, uniq, tr,
echo, mkdir, rmdir, touch, mv, cp, rm, sed, ss, curl, runtime
```

Pipes, redirects (`> file`, `>> file`), heredocs (`<< 'EOF'`), chaining (`&&`, `||`, `;`) and brace expansion all work.

```
# Read a file
cat /index.html

# Create a file
cat > /about.html << 'EOF'
<h1>About</h1>
EOF

# Edit a file
ss /index.html << 'EOF'
<h1>Old</h1>
=======
<h1>New</h1>
EOF

# Render a page through the project's compiler
curl localhost/
```

`curl localhost/<path>` is how to see compiled output without publishing anything.

Reading needs `projects:read`. Anything that writes needs `projects:write`.

`rm` deletes files in the project, not the project itself.

In the app, deleting files and reaching the web ask you to confirm the first time. A connector has
no screen to ask on, so the scope you approved is the confirmation: `projects:write` carries file
deletion, and `curl` may fetch a public address without a further prompt. Outbound requests are
still limited to public hosts, so a connector cannot reach a private address on your network.

**What does not work over MCP.** The agent's shell has a few commands that need something only the app provides, and they refuse with an explanation rather than with a bare error:

| Command | Why |
|---|---|
| `build`, `python`, `python3`, `lua` | Need the browser runtime (esbuild-wasm, Pyodide, Fengari) |
| `sqlite3` | Needs a deployment selected in the app; use `deployments_sql` instead |
| `status` | The in-app agent's task-completion report, which does nothing for an outside client |

### Backend functions, schedules and secrets

`backend_list`, `backend_upsert` and `backend_delete` work on the **project**, the same records Project Settings edits. Live traffic sees function changes after `deployments_publish`.

`backend_list` returns function code so an agent can edit it, plus secret **names**. Secret **values** are write-only: they can be set, never read back.

`code` is the function **body**, not a module: no `export default` and no wrapper. It runs inside an async function, so `await` works at the top level and the result goes back through `return`. An edge function has `request`, `db`, `secrets`, `Response` and `console` in scope.

```
const rows = await db.query('SELECT COUNT(*) AS n FROM hits');
return Response.json({ hits: rows[0].n });
```

A module-style function is accepted by `backend_upsert` and then fails at request time with `unsupported keyword: export`, so it is worth getting right first time.

A new edge or server function needs `code`. An update can change `enabled`, `method` or `description` without sending the code again. A new secret needs `value`. A schedule needs `cronExpression` and an existing edge function to trigger (`functionName`, or the schedule's own `name` if they match).

Secret values only reach a deployment if the instance has `SECRETS_ENCRYPTION_KEY` set. Without it the publish still succeeds and the secret arrives as a name with no value, so an edge function reading it gets nothing. See [Server Mode](?doc=server-mode) for the variable.

### Deployments

A typical publish path:

1. `deployments_create` — unpublished, database and analytics off
2. `deployments_update` — `analyticsEnabled: true` if you want built-in analytics. `databaseEnabled: true` only matters if you want the database before the first publish, since publishing turns it on anyway
3. `deployments_publish` — build and serve
4. `deployments_unpublish` — take the site off traffic again

A deployment is live when the files the build wrote are on disk, so `deployments_unpublish` removes them and the site stops answering. Its edge functions stop answering with it, and its scheduled functions stop running. Everything else is kept: the deployment, its settings, its runtime database, its analytics, and its address. `deployments_publish` puts the same site back at the same URL, so this is what to use to take a site down rather than deleting the deployment.

Published files are served with `Cache-Control: public, max-age=3600`, so the server stops answering straight away but a visitor who loaded the site in the last hour may still see it from their own browser cache.

`deployments_sql` runs one statement against that deployment's **live** runtime database (the same database the SQL editor uses). The database has to exist first: publishing creates it, or `deployments_update` with `databaseEnabled: true` creates it without publishing. SELECT is allowed on any table, including the system tables the backend features live in; writes to those system tables are refused, as are `PRAGMA`, `ATTACH`, `DETACH` and `VACUUM`, creating a trigger, and creating a temporary table that takes a system table's name. Function code is not live until you publish; SQL is immediate.

A query returns at most 5000 rows. Past that the answer comes back with `truncated: true`, so narrow it with `WHERE` or `LIMIT` rather than reading a capped result as the whole table.

### Analytics

`analytics_overview` reads pageviews, visitors and top pages. It reports whatever has been collected, so it answers with zeros for a deployment that has never had analytics on rather than refusing. It refuses only when the deployment has no database at all, since that is where the figures live.

Turning collection on is `deployments_update` with `analyticsEnabled: true` (the `deploy` scope), not the `analytics` scope, and it applies from the next publish.

---

## Running the agent needs a browser tab open

`agent_run` is the one tool that cannot run on the server alone.

Your provider API key lives in your browser's local storage and is never stored server-side, so the server has no way to start a task with a cloud model. Instead the server asks an open OSW Studio tab for your account to run it, and reports back what that tab does.

So before calling `agent_run`, **have OSW Studio open in a browser** and signed in to the same account. With no tab attached the call returns a message saying so rather than waiting.

Every other tool needs no browser tab, `agent_status` and `agent_cancel` included: once a task exists, its progress and its cancellation are handled on the server, so a client can start a task with a tab open and follow it after the tab is gone.

---

## Two writers on one project

Once a connector is attached, a project can be changed from two places: your browser and the agent. OSW Studio does not merge them silently.

- If the agent changes a project while your browser copy is **clean**, your browser picks up the change, including backend functions, schedules and secret names.
- If the agent changes it while you have **unsaved local edits**, new files from the server appear but your own edits are left alone, the project is marked as needing attention, and you are told to open Server Sync. Backend rows are left alone in that case too, so a later publish from the browser does not overwrite the agent's functions until you resolve the conflict.
- In Server Sync a conflicted project offers **Keep both**: the project takes the server's version, and your unsaved work is kept as a separate `{name} (local draft)` project.

Saving a project the agent has moved on from is refused rather than allowed to overwrite the agent's work. Your local work is kept either way. See [Server Mode](?doc=server-mode) for how syncing works generally.

---

## Clients

**Settings → MCP** lists every client you have authorised (workspace, scopes, added, last used). **Disconnect** revokes that client's token straight away; it has to run through consent again to get back in.

Worth a look now and then. A client you set up on a machine you no longer use keeps working until someone disconnects it, and the "last used" column is what tells you which ones are still live.

The same list is available over HTTP if you would rather script it, authenticated with your normal app session:

```
GET    /api/mcp/grants          # your grants, with client name, workspace, scopes and last use
DELETE /api/mcp/grants?id=<id>  # revoke one
```

---

## Troubleshooting

**The client gets a 404, or registration fails with a 404.**
The endpoint is off. Set `MCP_ENABLED=true` and restart the instance. A 404 is also what you get when the build does not include the connector at all.

**The client gets a 401 and never recovers.**
The grant was revoked or the token expired. Revoking happens on Disconnect, and also when the account loses access to the grant's workspace or is deactivated. Remove the server from your client and add it again so it runs through consent afresh.

**`agent_run` says no tab is open.**
Open OSW Studio in a browser, signed in to the same account, then retry. See the section above for why.

**A tool refuses with a permissions error.**
The grant does not carry the scope, or your role in that workspace is too low for it. Reconnect the client and allow the scope you need, or ask a workspace owner for a higher role.

**The connector reaches the wrong projects.**
A grant covers one workspace. Check which workspace you picked on the consent screen, and reconnect if you need a different one.

**`deployments_sql` says the database is not enabled.**
Publish the deployment, or call `deployments_update` with `databaseEnabled: true`. SQL runs against the live deployment database and does not create it.

---

## Related

- [Server Mode](?doc=server-mode) - the storage and syncing the connector works against
- [Projects](?doc=projects) - what a project is
- [Deployment Publishing](?doc=site-publishing) - what `deployments_publish` does
- [Backend](?doc=backend-features) - edge functions, tables, secrets and schedules
- [Working with AI](?doc=working-with-ai) - the in-app agent the `agent_*` tools drive
