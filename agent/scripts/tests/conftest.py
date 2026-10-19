"""Local fixtures for the script tests.

Carries its own ``temp_dir``, which these tests were written against in the repo
they came from, and puts the repo's ``agent/`` on ``sys.path``: the tests import
the scripts as ``scripts.<name>``, and ``agent/scripts`` is not an installed
package, so nothing else makes that name resolve.
"""

import sys
import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest

# `agent/`, so `import scripts.stage_omp_config` resolves to `agent/scripts/`.
AGENT_DIR = Path(__file__).resolve().parents[2]
if str(AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(AGENT_DIR))


@pytest.fixture
def temp_dir() -> Iterator[Path]:
    """Create a temporary directory for test files."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        yield Path(tmp_dir)
