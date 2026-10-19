# Reliability — keeping the agent alive across reboots and disconnects

A deploy isn't done when the agent runs once; it's done when it survives a
reboot and an SSH drop. Two layers cover this: a persistent multiplexer
session for continuity, and a supervisor for process continuity.

## 1. Herdr as a systemd user unit

Run herdr as a systemd **user** unit so it starts at boot and survives SSH
drops, without root:

```ini
# ~/.config/systemd/user/herdr.service
[Unit]
Description=Herdr agent multiplexer
After=network-online.target

[Service]
Type=simple
ExecStart=%h/.local/bin/herdr serve   # adjust to the real binary path
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

```
systemctl --user daemon-reload
systemctl --user enable --now herdr
```

Then enable **linger** so user units run at boot without an active login
session (without it, systemd kills user services on logout and never starts
them at boot):

```
loginctl enable-linger <deploy-user>
```

Verify: `loginctl show-user <deploy-user> -rLinger=yes` and
`systemctl --user status herdr` after a fresh boot (no SSH session open).

## 2. tmux fallback

If the box can't run herdr as a service (no systemd, restricted host), use
**tmux** as the multiplexer instead: `tmux new -s <agent>`, run the agent
inside it. Sessions survive SSH drops and reattach with `tmux attach -t
<agent>`. Everything else in this skill (moshi-hook, verify, dispatch) is
unchanged — the sessions are reachable the same way; only the multiplexer
differs.

## 3. Process continuity: herdr restores layout, not processes

**Herdr (like tmux) restores session LAYOUT, not the running processes.**
After a reboot the session exists but the agent process inside it does not.
Give the resume path explicitly:

- **Manual resume**: attach and re-run the agent binary, e.g. `omp -r` (OMP
  resumes its last session) inside the herdr/tmux session.
- **Supervisor**: for hands-off recovery, start the agent under a supervisor
  so it restarts with the host — a second systemd user unit (same pattern as
  above, `ExecStart=<agent> ...`, `Restart=on-failure`) or the harness's own
  service mode. The unit must attach into the herdr session, not run
  free-floating.
- **Reboot drill**: after wiring, actually reboot the box and confirm
  (a) herdr came up via the unit, (b) the agent session is restored, and
  (c) the agent process is running (restart it or let the supervisor do it).
  A deploy that hasn't passed this drill is not reliable.

## 4. Provisioning posture (applies when we set up the box)

- **Firewall**: allow SSH 22/tcp + Mosh's UDP range (60000–61000); deny
  everything else inbound. E.g. with ufw:
  `ufw allow 22/tcp && ufw allow 60000:61000/udp && ufw enable`.
- **SSH hardening** in `sshd_config`: `PermitRootLogin no` and
  `PasswordAuthentication no` (key-based auth only).
- **Deploy user**: the agent runs as a **non-root deploy user** in its own
  home — never root. If the box is fresh, create it:
  `adduser --disabled-password <deploy-user>` and install the SSH key in its
  `~/.ssh/authorized_keys`. (When provisioning via Terraform, the
  `~/repos/example-infra` cloud-init stack creates this user for you.)
