# Multitenancy

OSW Studio server mode supports workspaces and multiple users on a single instance. Workspaces are the primary unit of organization and isolation. Users are granted access to workspaces with roles.

## Concepts

### Workspaces

A workspace is a self-contained environment with its own projects, deployments, templates, skills, and quotas. Each workspace maps to its own SQLite database at `data/workspaces/{id}/osws.sqlite`. Data in one workspace is completely isolated from other workspaces.

Workspaces are what you manage. Users are just accounts that get access to workspaces.

### Access Model

There are two levels of access:

- **Instance admin** -- can create and manage workspaces, users, and instance settings via `/admin/users` and `/admin/workspaces`
- **Workspace member** -- can use the AI, edit projects, publish sites, and manage deployments within workspaces they have access to

All workspace members have the same capabilities within a workspace.

### How it fits together

An agency running OSWS might set up:
- A workspace per client (e.g., "Sweet Candies", "Nordic Bikes")
- Agency devs as members of each workspace they manage
- The client invited to their workspace, so they can use the AI for daily updates (adding articles, changing hours)
- Quota limits per workspace (1 project, 1 deployment for basic clients; more for premium)

A team might set up:
- One shared workspace for the team, everyone as members
- The team lead as instance admin

## Architecture

```
data/
  system.sqlite                    # Users, workspaces, access grants
  workspaces/
    {workspaceId}/
      osws.sqlite                  # Projects, files, templates, skills
      projects/
        {projectId}/
          database.sqlite          # User-defined project databases
  deployments/
    {deploymentId}/
      runtime.sqlite               # Published deployment runtime
      analytics.sqlite             # Published deployment analytics

public/
  deployments/
    {deploymentId}/                # Published static files
```

**system.sqlite** is the only shared database. It stores user accounts, workspace definitions, access grants (who can access which workspace), and deployment routing.

**Per-workspace osws.sqlite** contains everything within a workspace. The schema is identical to single-user mode. Isolation is physical (separate files), not logical.

## URL Structure

All workspace pages use the `/w/{workspaceId}/` prefix:
```
/w/{workspaceId}/projects
/w/{workspaceId}/deployments
/w/{workspaceId}/dashboard
/w/{workspaceId}/settings
```

API routes follow the same pattern:
```
/api/w/{workspaceId}/sync/projects
/api/w/{workspaceId}/deployments
/api/w/{workspaceId}/shell/execute
```

System-wide admin pages (no workspace context):
```
/admin/users
/admin/workspaces
/admin/login
```

## Setup

### 1. Initial Setup

On a fresh install with `NEXT_PUBLIC_SERVER_MODE=true`:

1. Visit `/admin` -- you'll be redirected to a registration page
2. Create the admin account (email + password)
3. You're in. The first user automatically becomes admin with an unlimited workspace.

No `ADMIN_PASSWORD` env var is needed for new installs. The legacy admin password only works as a bootstrap mechanism when no user accounts exist.

### 2. Configure Environment

Add to your `.env` alongside standard server mode variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `REGISTRATION_MODE` | `closed` | `open` = users can self-register. `closed` = admin creates accounts |
| `NEXT_PUBLIC_REGISTRATION_MODE` | `closed` | Client-side mirror (controls register link visibility) |
| `INSTANCE_API_KEY` | *(none)* | Admin API accepts `x-instance-api-key` header for programmatic access |

See **[Server Mode](?doc=server-mode)** for the full variable list.

### 3. Choose How Users Join

**Open registration** (`REGISTRATION_MODE=open`): Users visit `/admin/register`, create an account, and get a default workspace automatically.

**Admin-managed** (default): Admin creates users and workspaces via `/admin/users` and `/admin/workspaces`, then grants access.

### 3. Create Workspaces

**Via admin UI** at `/admin/workspaces`:
- Click "New Workspace", set a name and assign an owner
- Expand a workspace row to see members, add or remove access
- Edit quotas (max projects, deployments, storage) per workspace

**Via admin API**:
```
POST /api/admin/workspaces
{ "name": "Sweet Candies", "ownerEmail": "dev@agency.com" }
```

### 4. Grant Access

**Via admin UI**: Expand a workspace, click "Add Member", enter email and role.

**Via admin API**:
```
POST /api/admin/workspaces/{id}/access
{ "email": "client@sweetcandies.com", "role": "editor" }
```

## Admin API Reference

All admin routes require an admin session or the `x-instance-api-key` header.

### Workspace Management

```
GET    /api/admin/workspaces              -- list all workspaces with stats
POST   /api/admin/workspaces              -- create workspace
GET    /api/admin/workspaces/{id}         -- workspace detail + members
PUT    /api/admin/workspaces/{id}         -- update (name, quotas)
DELETE /api/admin/workspaces/{id}         -- delete workspace
POST   /api/admin/workspaces/{id}/access  -- grant user access
DELETE /api/admin/workspaces/{id}/access  -- revoke user access
POST   /api/admin/workspaces/{id}/repair  -- detect and fix data issues
```

### User Management

```
GET    /api/admin/users              -- list all users with their workspaces
POST   /api/admin/users              -- create user account
GET    /api/admin/users/{id}         -- user detail + workspaces
PUT    /api/admin/users/{id}         -- update (display name, active)
DELETE /api/admin/users/{id}         -- deactivate user
```

### User's Own Workspaces

```
GET /api/workspaces -- list workspaces the current user has access to
```

## Quotas

Each workspace has configurable limits. Defaults:
- 3 projects
- 1 published deployment
- 100 MB storage

Enforced at:
- **Project creation** — rejects sync push when at project limit
- **Deployment publishing** — rejects publish when at deployment limit
- **File sync** — rejects file push when storage limit reached

A warning banner appears in the workspace UI when storage usage exceeds 80%.

Configurable per-workspace via the admin UI or API. An agency might give basic clients 1 project / 1 deployment and premium clients 10 / 5.

## Upgrading from Single-User Mode

Existing single-user instances automatically migrate when multitenancy is enabled:

1. On first login, a default workspace is created with unlimited quotas
2. Existing projects, deployments, templates, and skills are copied from `data/osws.sqlite` to the workspace
3. Project databases from `data/projects/` are copied to the workspace

If migration doesn't complete (e.g., already logged in when workspace was created), a "Workspace Setup Required" dialog offers to re-login and retry. Manual repair is available via:

```
POST /api/admin/workspaces/{id}/repair
```

## Security

- **Physical isolation**: Each workspace has its own SQLite file. No cross-workspace data leakage possible from missing query filters.
- **Role-based access**: Every workspace API request verifies the user has sufficient access via `verifyWorkspaceAccess()`.
- **Path validation**: Workspace IDs validated as UUIDs before file path construction.
- **Timing-safe auth**: API key and password comparisons use constant-time operations.
- **Statement blocking**: ATTACH, DETACH, PRAGMA, VACUUM blocked in user-facing SQL execution.
- **Session validation**: Deactivated users' sessions invalidated on next request.

## Browser Mode Compatibility

All multitenancy code is in server mode code paths, gated by `NEXT_PUBLIC_SERVER_MODE`. Browser mode (IndexedDB, client-side only) is completely unaffected.
