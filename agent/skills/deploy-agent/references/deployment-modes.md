# Deployment modes — getting config and data onto the host

Once the target and the harness are validated, provision the box (below),
then transport the agent's transportable config/data to it. Two transport
modes; they can be mixed per config-vs-memory bucket.

## Provisioning (how the box itself comes to exist)

- **Terraform / IaC**: this mode points at the separate repo
  `~/repos/example-infra` — hcloud provisioning + a cloud-init stack
  (creates the non-root deploy user, installs runtimes, hardens SSH, opens
  the firewall). When the user picks IaC, work there; the skills repo ships
  no Terraform. If that repo doesn't exist at that path, ask the user for
  its location rather than inventing a stack.
- **Ad hoc scripts**: provision manually per `references/reliability.md`
  §4 — non-root deploy user (`adduser --disabled-password <deploy-user>` +
  its SSH key), firewall allowing only 22/tcp + Mosh UDP 60000–61000,
  `PermitRootLogin no`, `PasswordAuthentication no`.

After provisioning, transport the agent's config/data with one of the two
transport modes below.

## git mode — pull from a private backup repo

The config lives in a private git repo — for this harness,
`evanokeefe39/omp-home`, committed in place by `agent/scripts/omp-git-sync.sh`;
`evanokeefe39/example-data` mirrors the usage ledger and generated memory tree to
R2. The box clones/pulls it and applies it.

- **Mechanics**: shallow clone on the box, then either run the repo's
  `install.sh` if it ships one, or copy files into the target home; pin the
  commit so plan == apply.
- **Pros**: cheap diffs, self-updating on the box, no laptop needed after
  first boot, natural for config that several targets share.
- **Cons**: needs a per-repo read-only deploy key on the box; config must be
  pushed first (deploy lags the dev machine until
  `agent/scripts/omp-git-sync.sh` runs).
- **Access**: `scripts/deploy-key.sh` sets up a read-only ed25519 deploy key
  per repo (private key pushed 0600 over SSH; public key registered read-only
  in GitHub). No key material in committed files. Note: a deploy key is scoped
  to a single repo — GitHub forbids reusing one key across repos — so run
  `deploy-key.sh` once per private repo (distinct `<key-name>` each time) and
  route each clone to its key (e.g. `GIT_SSH_COMMAND="ssh -i <key> …"`).

## local-copy mode — stream from the local machine

The config is copied from this machine over SSH.

- **Mechanics**: `tar -C <src> -czf - . | ssh <host> 'mkdir -p <dst> && tar -C <dst> -xzf -'` (bsdtar ships with Windows 10+/macOS/Linux; no rsync dependency). Prefer rsync if present on both ends.
- **Pros**: no git infra, no keys in repos, deploys uncommitted WIP, simplest
  for a one-off.
- **Cons**: needs this machine online; larger payloads; no history/pinning
  beyond a snapshot.

## Which to use

- **git** for stable, committed config you may deploy to several targets — the
  OMP `example-config` case. Git carries memory too, for a harness whose memory
  is hand-written; where the harness generates it, memory is data, not config.
- **local-copy** for machine-local config, WIP, or agents with no backup repo.
- Mix per bucket: e.g. config from git, memory from local.
- Memory a harness generates is in neither: OMP's tree is mirrored to R2 under
  `omp/memories/` by `example-data` and no commit carries it, so a target that
  needs it restores from object storage rather than from a clone.

## Resync rule

git-mode source of truth is the repo. To bring the box up to date: run
`agent/scripts/omp-git-sync.sh` on the dev machine (pushes to the repos), then
re-plan and re-apply — the new commit flows through the same pipeline.

## Safety on every apply

- Snapshot the target home (tar over SSH, stored locally) **before** any
  overwrite, so a bad apply can be rolled back.
- Verify after apply (ownership, hashes, binaries, herdr/moshi reachable).
- Fresh-host additive deploys (nothing to clobber) are the safe auto-apply
  case; overwriting existing files requires explicit user approval.
- Never delete remote files unless the user explicitly asks (and approves).
