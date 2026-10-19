@echo off
rem Windows entry point for install-git-hooks.sh.
rem
rem The script itself is plain sh because git runs hooks with sh, so the copy has
rem to be sh regardless of the host OS. This wrapper exists only so the installer
rem can be run from a cmd/PowerShell prompt and from Task Scheduler without
rem knowing where git bash lives.
rem
rem Idempotent and safe to re-run: agent/scripts/install-git-hooks.sh decides
rem what to write and refuses to overwrite a hook that is not ours. The exit code
rem is propagated verbatim, so a refusal or an ineffective install (core.hooksPath
rem pointing elsewhere) reports non-zero rather than printing a green line.

setlocal

set "SCRIPT=%~dp0install-git-hooks.sh"
set "GIT_BASH=C:\Program Files\Git\bin\bash.exe"

if not exist "%GIT_BASH%" (
  echo install-git-hooks: ERROR - git bash not found at "%GIT_BASH%" >&2
  exit /b 127
)
if not exist "%SCRIPT%" (
  echo install-git-hooks: ERROR - script not found at "%SCRIPT%" >&2
  exit /b 127
)

"%GIT_BASH%" -lc "%SCRIPT:\=/% %*"
exit /b %ERRORLEVEL%
