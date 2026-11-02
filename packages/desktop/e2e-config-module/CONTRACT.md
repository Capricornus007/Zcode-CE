# desktop-e2e-config

Owns WDIO/Electron test-runner orchestration: worker isolation, fixture servers, environment projection, build reuse, and final cleanup.

It is an adapter-only module and never participates in packaged Desktop runtime behavior. Worker-specific paths and ports must remain isolated; reuse is explicit. Provider fixtures and remote assets are prepared before a spec and cleaned even after failure.
