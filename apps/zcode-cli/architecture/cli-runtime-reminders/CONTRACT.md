# cli-runtime-reminders

Owns the caliber guard, due-followup, task re-anchor, and user-instructions-change reminder candidates injected into a turn.

Each reminder derives from current runtime or filesystem facts and carries its own cadence/dedupe boundary. The runtime remains the message-history owner; this module only proposes typed reminder content. Caliber matching reuses the real-user-text extraction owned by memory recall.
