# Infra interview — establish what the user already has, wants, and prefers

Before proposing anything, ask the user. The answers decide the provisioning
path, what additional info is required, and which steps to detail. Ask
conversationally; gather the essentials, don't interrogate. Record the answers
so the plan reflects the user's actual situation and preferences.

## 1. Desired agents and purpose

"Which agent(s) do you want to deploy, and what do you need them for?" (e.g.
OMP for coding, Pi, Hermes, OpenClaw, multiple.) "Which AI providers / API keys
does it use?" This tells us what secrets must exist on the box (provisioned
there, not transported) and whether private config repos are involved.

## 2. Budget

"How much do you want to spend per month on infra?" This bounds the server
size, provider, and whether to provision fresh vs reuse. State a rough cost
note for any paid infra in the plan (e.g. a small VPS ≈ EUR 5–25/mo billed
hourly). Zero is fine — see local mode below.

## 3. Existing infra

"Do you already have somewhere to run this, or should we provision it?"

- **Existing host** (the default path) — Hetzner / AWS / Azure / GCP / a
  spare VPS or box. → We target that box: need its address, SSH access, and
  OS details. **Provision fresh** if they have none: which provider (if any)
  do they prefer, and does it fit their budget? If they don't care, recommend
  the simplest path that fits.
- **Just this machine (local mode)** — a de-scoped fallback, not the lead:
  no provisioning; wire herdr + moshi on the laptop/desktop and reach the
  agent from Moshi. Only pick this if the user explicitly wants it and
  accepts the caveat: the machine must stay on and be exposed as a
  connection target, which is hostile to the usual security posture (don't
  expose a desktop over the internet). Prefer moving them to remote mode.

## 4. Networking and access

"How do you want to reach it?"

- Laptop over SSH — need SSH access + a multiplexer (herdr/tmux).
- Phone over Mosh — need the Mosh UDP range open + herdr session.
- Push notifications — need moshi-hook paired to the Moshi app (Easy Pair QR).
- What firewall posture do they want (lock to their IP vs any IP)? Mosh's UDP
  range and SSH port matter here.

## 5. Tooling preference

"How do you want the infra managed?" This is a real choice, not a default:

- **Terraform / Infrastructure-as-Code** — reproducible, destroyable, reviewed
  in git. Good when they want a clean teardown and versioned infra. Points at
  the separate `~/repos/example-infra` repo (hcloud + cloud-init).
- **Ad hoc shell scripts** — quicker, less ceremony, no state/toolchain.
  Good for a one-off box or when they don't want IaC overhead.
- Offer the tradeoff; let them choose. Do not impose one.

## 6. Additional info the answers unlock

State precisely what's still needed, e.g.:

- local mode → nothing but an SSH-capable shell on this machine (or just
  localhost) + the Moshi app.
- provision fresh on Hetzner → Hetzner API token; your SSH public key.
- existing AWS box → the box's address, an SSH key with access, OS details.
- private config repos → a read-only deploy key (see `scripts/deploy-key.sh`).
- AI provider keys → provisioned interactively on the box after deploy.

## Decision summary

End with a one-line plan that reflects their choices: "We'll run it in local
mode — herdr + moshi-hook on this machine, reachable from your phone over
Mosh — no provisioning. If you later want it always-on, we move it to a Hetzner
VPS." Or, if they chose remote: "We'll provision a Hetzner VPS (~EUR 10/mo)
with Terraform, run herdr + moshi-hook, and deploy OMP there." Then move to
planning.
