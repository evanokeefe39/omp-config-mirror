"""Unit tests for the config-archive builder."""

import io
import stat
import tarfile
from pathlib import Path

import pytest

from scripts.build_config_archive import build_config_archive


@pytest.fixture
def config_root(temp_dir: Path) -> Path:
    root = temp_dir / "root"
    (root / "agent" / "skills" / "demo").mkdir(parents=True)
    (root / "agent" / "AGENTS.md").write_text("# notes\n", encoding="utf-8")
    (root / "agent" / "skills" / "demo" / "SKILL.md").write_text(
        "x\n", encoding="utf-8"
    )
    (root / "marketplaces.json").write_text("{}\n", encoding="utf-8")
    return root


def _members(archive: Path) -> list[str]:
    with tarfile.open(fileobj=io.BytesIO(archive.read_bytes()), mode="r:gz") as tar:
        return tar.getnames()


def test_two_builds_of_the_same_input_share_a_digest(
    config_root: Path, temp_dir: Path
) -> None:
    _, first = build_config_archive(config_root, temp_dir / "a")
    _, second = build_config_archive(config_root, temp_dir / "b")
    assert first == second


def test_a_different_name_gives_a_different_digest(
    config_root: Path, temp_dir: Path
) -> None:
    _, default = build_config_archive(config_root, temp_dir / "a")
    _, renamed = build_config_archive(config_root, temp_dir / "b", name="other")
    assert default != renamed


def test_the_archive_wraps_exactly_one_named_directory(
    config_root: Path, temp_dir: Path
) -> None:
    archive, _ = build_config_archive(config_root, temp_dir / "out", name="cfg")
    names = _members(archive)
    assert {name.split("/", 1)[0] for name in names} == {"cfg"}
    assert "cfg/agent/skills/demo/SKILL.md" in names
    assert "cfg/marketplaces.json" in names


def test_a_bare_agent_directory_is_rejected(config_root: Path, temp_dir: Path) -> None:
    with pytest.raises(SystemExit, match="no agent/ directory"):
        build_config_archive(config_root / "agent", temp_dir / "out")


def test_nothing_but_the_archive_is_left_in_the_destination(
    config_root: Path, temp_dir: Path
) -> None:
    dest = temp_dir / "out"
    archive, _ = build_config_archive(config_root, dest)
    assert list(dest.iterdir()) == [archive]


def test_a_read_only_input_can_be_built_twice_into_one_destination(
    config_root: Path, temp_dir: Path
) -> None:
    locked = config_root / "agent" / "AGENTS.md"
    locked.chmod(stat.S_IREAD)
    dest = temp_dir / "out"
    try:
        _, first = build_config_archive(config_root, dest)
        _, second = build_config_archive(config_root, dest)
    finally:
        locked.chmod(stat.S_IREAD | stat.S_IWRITE)
    assert first == second
