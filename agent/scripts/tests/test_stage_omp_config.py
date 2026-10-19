"""Unit tests for the config staging script's exclusion rules.

Nothing else exercises the staging script, which is why the rules are pinned: an
exclusion that stops applying still stages something, and a copy that lost a
surface looks the same as one that never had it.
"""

from pathlib import Path

import pytest

from scripts.stage_omp_config import EVAL_EXCLUDED_PATHS, main

# A miniature live home: every entry staging has an opinion about, including a
# *config* directory whose name is also a root runtime directory's.
CONFIG_PATHS = (
    ".harbor-config.json",
    "AGENTS.md",
    "mcp.json",
    "extensions/herdr-omp-agent-state.ts",
    "extensions/omp-identity.ts",
    "extensions/playbook-probe/index.ts",
    "rules/style.md",
    "skills/demo/SKILL.md",
)
# Runtime state and secrets: excluded by name, and only at the source root.
EXCLUDED_PATHS = (
    ".env",
    "agent.db",
    "last-changelog-version",
    "playbook-probe/events.jsonl",
    "sessions/01.jsonl",
)


def _write(path: Path, text: str = "x\n") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


@pytest.fixture
def source(temp_dir: Path) -> Path:
    """Build a live-home-shaped source directory."""
    root = temp_dir / "src"
    for rel in CONFIG_PATHS + EXCLUDED_PATHS:
        _write(root / rel)
    # Empty in the *source* is config, not a remnant; the prune leaves it.
    (root / "rules" / "empty-but-intended").mkdir()
    return root


def _stage(source: Path, dest: Path, *argv: str) -> None:
    code = main(["--source", str(source), "--dest", str(dest), *argv])
    assert code == 0


def _staged(dest: Path) -> set[str]:
    """Every file in the copy, as a source-root-relative posix path."""
    return {
        path.relative_to(dest).as_posix() for path in dest.rglob("*") if path.is_file()
    }


def _staged_dirs(dest: Path) -> set[str]:
    return {
        path.relative_to(dest).as_posix() for path in dest.rglob("*") if path.is_dir()
    }


def test_config_directory_sharing_a_runtime_name_is_copied(
    source: Path, temp_dir: Path
) -> None:
    # `playbook-probe` names the root log directory; a name matched at any
    # depth would drop the extension under `extensions/`.
    dest = temp_dir / "out"
    _stage(source, dest)

    assert _staged(dest) == set(CONFIG_PATHS)
    assert "extensions/playbook-probe/index.ts" in _staged(dest)
    assert _staged_dirs(dest) >= {"extensions/playbook-probe"}
    # The root directory by that name is still runtime state, not config.
    assert "playbook-probe" not in _staged_dirs(dest)


def test_runtime_state_is_excluded(source: Path, temp_dir: Path) -> None:
    dest = temp_dir / "out"
    _stage(source, dest)

    assert not _staged(dest) & set(EXCLUDED_PATHS)
    assert "sessions" not in _staged_dirs(dest)


def test_eval_list_is_the_decided_paths_and_each_says_why() -> None:
    assert set(EVAL_EXCLUDED_PATHS) == {
        ".harbor-config.json",
        "extensions/herdr-omp-agent-state.ts",
        "extensions/playbook-probe/index.ts",
        "extensions/omp-identity.ts",
        "mcp.json",
    }
    assert all(reason.strip() for reason in EVAL_EXCLUDED_PATHS.values())


def test_eval_drops_exactly_the_listed_paths(
    source: Path, temp_dir: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    dest = temp_dir / "out"
    _stage(source, dest, "--eval")

    assert _staged(dest) == set(CONFIG_PATHS) - set(EVAL_EXCLUDED_PATHS)
    # Each drop is printed with its own reason, so a prune is never silent.
    out = capsys.readouterr().out
    for rel, why in EVAL_EXCLUDED_PATHS.items():
        assert f"dropping {rel}: {why}" in out


def test_eval_stages_no_harbor_lineage_file(source: Path, temp_dir: Path) -> None:
    # A trial's own provenance record. Staging it would tell the agent under
    # test it is being evaluated, so `--eval` must drop it (OAV-4). The source
    # assertion is the one that keeps this from passing vacuously.
    dest = temp_dir / "out"
    _stage(source, dest, "--eval")

    assert (source / ".harbor-config.json").is_file()
    assert ".harbor-config.json" not in _staged(dest)


def test_dry_run_names_every_drop_and_copies_nothing(
    source: Path, temp_dir: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    dest = temp_dir / "out"
    _stage(source, dest, "--dry-run", "--eval")

    assert not dest.exists()
    out = capsys.readouterr().out
    for rel in EVAL_EXCLUDED_PATHS:
        assert f"dropping {rel}:" in out
    assert "dry run: nothing copied" in out


def test_exclude_path_is_relative_to_the_source_root(
    source: Path, temp_dir: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # A bare name is not a path: it names nothing at the root, so nothing is
    # dropped, and the run says so rather than looking successful.
    dest = temp_dir / "out"
    _stage(source, dest, "--exclude-path", "omp-identity.ts")
    assert _staged(dest) == set(CONFIG_PATHS)
    assert "not in the source" in capsys.readouterr().err

    dest = temp_dir / "out2"
    _stage(source, dest, "--exclude-path", "extensions/omp-identity.ts")
    assert _staged(dest) == set(CONFIG_PATHS) - {"extensions/omp-identity.ts"}


def test_exclude_path_may_name_a_directory(source: Path, temp_dir: Path) -> None:
    dest = temp_dir / "out"
    _stage(source, dest, "--exclude-path", "extensions")

    assert _staged(dest) == set(CONFIG_PATHS) - {
        "extensions/herdr-omp-agent-state.ts",
        "extensions/omp-identity.ts",
        "extensions/playbook-probe/index.ts",
    }


def test_exclude_stays_a_basename_matched_at_any_depth(
    source: Path, temp_dir: Path
) -> None:
    # The blunt escape, kept on purpose: unlike --exclude-path it does reach
    # into a subdirectory.
    dest = temp_dir / "out"
    _stage(source, dest, "--exclude", "index.ts")

    assert "extensions/playbook-probe/index.ts" not in _staged(dest)
    assert "extensions/omp-identity.ts" in _staged(dest)


def test_exclude_path_that_never_matches_says_so(
    source: Path, temp_dir: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # `extensions/../mcp.json` resolves on disk but is not a path the walk ever
    # spells, so it drops nothing and says so.
    dest = temp_dir / "out"
    _stage(source, dest, "--exclude-path", "extensions/../mcp.json")

    assert _staged(dest) == set(CONFIG_PATHS)
    assert "mcp.json" in _staged(dest)
    assert "--exclude-path extensions/../mcp.json" in capsys.readouterr().err


def test_a_drop_leaves_no_empty_directory(
    source: Path, temp_dir: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # `--eval` drops all three files under `extensions/`, so the drop empties
    # that directory too; a remnant it leaves would be indistinguishable from
    # the accidental drop.
    dest = temp_dir / "out"
    _stage(source, dest, "--eval")

    dirs = _staged_dirs(dest)
    assert "extensions" not in dirs
    assert "extensions/playbook-probe" not in dirs
    # The only empty directory left is the one the source itself had: a drop's
    # remnant is gone, and config the source chose to keep is kept.
    assert {d for d in dirs if not any((dest / d).iterdir())} == {
        "rules/empty-but-intended"
    }

    out = capsys.readouterr().out
    assert "removed the directory extensions/playbook-probe" in out
    assert "removed the directory extensions," in out
