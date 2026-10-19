@echo off
rem Daily sync of ~/.omp against the private omp-home repo.
rem
rem Thin wrapper around agent/scripts/omp-git-sync.sh, which fetches, fast-forwards
rem `main` only when that is safe, and reports. It never stages, commits, stashes or
rem pushes — the machine is not an author, so nothing here can publish unreviewed
rem work. The exit code is propagated verbatim so Task Scheduler's Last Result
rem reflects the real outcome — the previous mirror backup reported 0 while its
rem commit was being refused, and the stall went unnoticed for six days.
rem
rem Exit codes: 0 ran (a deliberate skip — another branch, a commit ahead, a dirty
rem tree — is a state to report, not a failure); 3 dirty CODE paths, meaning
rem unreviewed work exists on this machine only (nothing was committed either way);
rem anything else means it could not do its job.
rem
rem AC-only by design (DisallowStartIfOnBatteries on the task) but with
rem StartWhenAvailable, so a missed run catches up rather than being silently
rem skipped. A failure additionally drops ~/.omp/SYNC-STALLED and records
rem sync-status.json.

setlocal

set "REPO=%USERPROFILE%\.omp"
set "SCRIPT=%REPO%\agent\scripts\omp-git-sync.sh"
set "GIT_BASH=C:\Program Files\Git\bin\bash.exe"

if not exist "%GIT_BASH%" (
  echo omp-git-sync: ERROR — git bash not found at "%GIT_BASH%" >&2
  exit /b 127
)
if not exist "%SCRIPT%" (
  echo omp-git-sync: ERROR — script not found at "%SCRIPT%" >&2
  exit /b 127
)

"%GIT_BASH%" -lc "%SCRIPT:\=/%"
set "SYNC_EXIT=%ERRORLEVEL%"

if "%SYNC_EXIT%"=="0" exit /b 0
if "%SYNC_EXIT%"=="3" (
  echo omp-git-sync: exit 3 — unreviewed code is dirty. The run itself succeeded and committed nothing; this is the report, not a failure. >&2
  exit /b 3
)
echo omp-git-sync: ERROR — omp-git-sync.sh exited %SYNC_EXIT% >&2
exit /b %SYNC_EXIT%
