# source-server-transport

Owns Source Server environment probing, release transfer/install, daemon readiness, ingress credentials, and the byte channel for SSH/WSL/Docker targets.

`contract.ts` is the neutral type boundary. Probe and release-download adapters depend on it rather than on `transportAdapter`, preventing orchestration cycles. Probe is read-only; install/update and daemon actions are explicit adapter commands. Cancellation is checked across every remote await, and secrets never enter logs.
