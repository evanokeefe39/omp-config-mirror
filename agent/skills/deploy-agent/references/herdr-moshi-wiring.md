# Herdr + Moshi wiring — the universal control layer

Every deploy converges on the same end state regardless of which harness:
the agent runs inside **Herdr** (agent-aware terminal multiplexer with a
status sidebar) and the user gets **Moshi** push notifications + Easy Pair QR
on their phone. This layer is harness-agnostic — wire it once, after the
harness itself is running.

## On the target host

1. **Herdr** — install and run as the deploy user:
   `curl -fsSL https://herdr.dev/install.sh | sh` then `herdr`. Open a session
   for the agent so it runs inside herdr (its status sidebar shows the agent
   panes). Persist across reconnects (herdr/tmux survive SSH drops).
   For boot survival (systemd user unit + `loginctl enable-linger`, tmux
   fallback, and the process-resume path — herdr restores session layout,
   not running processes), follow `references/reliability.md`.
2. **moshi-hook** — install and pair:
   - `curl -fsSL https://getmoshi.app/install.sh | sh`
   - `moshi-hook pair` → shows an **Easy Pair QR** the user scans with the
     Moshi mobile app (this is the `moshi_pair_command`).
   - Start the daemon so it keeps pushing agent events to the phone.

## Access paths (match the user's interview answers)

- **Laptop** — SSH to the host, attach to the herdr session.
- **Phone** — Mosh (UDP) to the host, land in the same herdr session. If the
  host's firewall is ours to set, open Mosh's UDP range (e.g. 60000–61000)
  and SSH 22/tcp only.

## Verify the wiring (scripts/verify-remote.sh)

- `herdr` runs and a session for the agent exists.
- `moshi-hook` is running and paired (QR already scanned).
- The agent binary is on the deploy user's PATH inside the herdr session.
- Confirm the user can actually reach it: laptop via SSH, phone via Mosh +
  Moshi push.

## Note

Moshi pairing is inherently interactive (the user scans the QR with their
phone). The deploy can reach "everything running, waiting for the QR scan",
then the user completes the phone pairing. That last step is theirs, not the
skill's.
