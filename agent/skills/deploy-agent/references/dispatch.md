# Dispatch — how a local agent hands work to a remote one

Dispatch is folded into `deploy-agent` (this skill). The playbook below is
what `deploy-agent` follows when the user asks to send a task to a deployed
remote agent. Dispatch is a **handoff to a prepared replica**, not a command
execution: the target agent has no memory of your local session, so before a
task makes sense remotely the workspace must exist there (repo cloned +
current), the dispatch must run in the correct working directory, and the
task must be self-contained (concrete paths and constraints, not "fix the
bug").

## 1. Herdr-native remote dispatch (recommended for local herdr → remote herdr)

If you run herdr on both machines, herdr itself is the transport and the
dispatch mechanism — no custom protocol:

- **Attach a remote herdr server**: `herdr --remote <host>` or
  `herdr --remote ssh://user@host[:port]` runs a thin client locally that
  attaches to the remote herdr server over SSH (`--session <name>` for a
  named session). The local machine stays a client; nothing is exposed
  inbound.
- **Dispatch a task**: `herdr agent prompt <target>` sends a prompt to a
  remote agent, and `herdr pane send-text <pane_id> "task…"` /
  `herdr pane send-keys` send literal text or logical keys into a remote
  pane. These run inside the remote herdr session, so the task is
  visible/monitorable there (and from a phone via Mosh → herdr).

Pros: native, interactive-capable, runs in the right remote session (so the
cwd/workspace is whatever that session is attached to), and the task stays
visible to Moshi. Cons: requires herdr running on both ends + SSH to the
box; still verify the remote session is in the correct working directory
first.

## 2. SSH + the remote agent's own headless mode (recommended for a personal setup)

No custom protocol. The local agent SSHes to the box and invokes the remote
agent's CLI directly (or writes into its herdr session). The **local session
remains the orchestrator**: it prepares the workspace, sends the task, and
receives the result — it never "becomes" the target session.

- **One-shot**: run the agent non-interactively and capture output, e.g. OMP
  supports `omp --print "task"` (non-interactive) and `omp --mode=rpc`
  (structured text/json/rpc output) — check the harness's own `--help` for
  its equivalents.
- **Interactive/long-running**: write the task into the remote agent's herdr
  session so it stays visible on the phone via Mosh, then report where it's
  running and how to follow it.

**Workspace prep (the step that makes dispatch real).** The target must be a
replica of the local workspace: repo present + current (clone/pull/push to
sync), correct working directory (`cd ~/workspace/<repo> && …`, never
`$HOME`), and a decided revision (local HEAD, pinned, or branch). Never
dispatch into a missing repo — that is a silent no-op; if you can't sync it,
stop and tell the user.

Pros: trivial, no services, works for any harness that runs as a CLI.
Cons: you must know each harness's invocation (verify from its docs — never
guess). No discovery or structured result contract beyond exit code/output.

## 3. MCP — Model Context Protocol (agent-to-tool)

The remote agent exposes its capabilities as an **MCP server** (a "run task"
tool, plus any resources/prompts). The local agent connects to it over an
SSH-transported MCP endpoint and calls the tool, getting structured results.

Pros: well-supported across harnesses; structured; incremental; the remote
agent can also expose skills as MCP resources.
Cons: you stand up an MCP server on the box (or an MCP adapter for the
agent).

## 4. A2A — Agent-to-Agent Protocol (agent-to-agent, Linux Foundation)

The remote agent runs an **A2A server** publishing an agent card (discovered
at `/.well-known/agent.json`); the local agent (A2A client) sends tasks via
JSON-RPC with a task lifecycle (send/get/cancel/subscribe) and artifacts.

Pros: the emerging standard for agent-to-agent interoperability; capability
discovery; A2A servers can expose skills via MCP.
Cons: heaviest — needs an HTTP server on the box; overkill for a
single-user VPS unless you plan to dispatch to arbitrary third-party agents.

## Rule of thumb

- Dispatching to **your own** remote agent: **herdr-native if herdr runs on
  both ends, else SSH + its headless CLI**.
- Want a **structured, protocol-level** interface later: add **MCP**.
- Want **interoperability with other agents/vendors**: **A2A**.

Whichever you choose, quote the task as an opaque payload (never let your
local shell interpret it), run it as the non-root user the agent runs as,
and verify the remote agent's invocation from its docs first (see
`references/research-methodology.md`); never guess a command that could
silently do the wrong thing.
