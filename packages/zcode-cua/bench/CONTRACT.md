# zcode-cua-bench

Owns the Windows machine-level calibration bench for the shipped CUA runtime and translation layer.

Each task performs a real operation and records programmatic evidence, elapsed time, and failure detail. A failed prerequisite is a failed/skipped task, never a synthetic pass. The bench may launch disposable Notepad windows and write `bench/result.json`; it is not part of production runtime startup.
