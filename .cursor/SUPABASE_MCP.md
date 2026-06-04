# Supabase MCP (Cursor)

This project includes Supabase MCP so the agent can manage tables, run SQL, deploy Edge Functions, and read logs.

## Quick setup

1. **Reload MCP** — Open **Cursor Settings → Tools & MCP** (or **Features → MCP**). Confirm **supabase** appears from `.cursor/mcp.json`.
2. **Authorize** — Click **Connect** / **Authorize** (or **Needs authentication** under the server name). Log in to Supabase in the browser and allow access.
3. **Verify** — Ask the agent: *"List tables in my Supabase project using MCP."*

Official docs: https://supabase.com/docs/guides/getting-started/mcp

## Optional: scope to one project (recommended)

In the Supabase dashboard, open your project. The URL contains the ref:

`https://supabase.com/dashboard/project/<project_ref>`

Copy `mcp.json.example` to `mcp.json` (or edit `mcp.json`) and set:

```text
https://mcp.supabase.com/mcp?project_ref=<project_ref>
```

Add `&read_only=true` if you only want read-only SQL (safer; migrations/deploy tools may be limited).

## Local Supabase CLI

When running `supabase start`, you can point MCP at:

```text
http://localhost:54321/mcp
```

(Limited tools; no OAuth — see Supabase local MCP docs.)

## CI / no browser (personal access token)

Create a token: https://supabase.com/dashboard/account/tokens

```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=YOUR_PROJECT_REF",
      "headers": {
        "Authorization": "Bearer YOUR_PERSONAL_ACCESS_TOKEN"
      }
    }
  }
}
```

Do not commit tokens. Use environment variables if your MCP client supports them.

## Security (flower / keyword monitor)

- Use a **development** Supabase project, not production customer data.
- Prefer **`read_only=true`** unless you need `apply_migration` / `deploy_edge_function`.
- Keep **manual approval** enabled for MCP tool calls in Cursor.
- Scope with **`project_ref`** so the agent cannot touch other projects.

## Plugin vs project MCP

`.cursor/settings.json` may already enable the **Supabase Cursor plugin**. Project `.cursor/mcp.json` is for repo-specific, shareable config. If both are active, you may see duplicate Supabase tools — disable one if that is confusing.
