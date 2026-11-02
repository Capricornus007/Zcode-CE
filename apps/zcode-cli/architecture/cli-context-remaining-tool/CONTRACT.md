# cli-context-remaining-tool

Owns the read-only `GetContextRemaining` schema and handler. It projects the current runtime token facts; it never mutates the conversation, starts a model request, or estimates a second usage source.

The contracts package owns the public tool schema. Core owns execution against the already-admitted runtime context. Registration remains in the existing Core tool registry.
