# cli-model-request-stability

Owns request-prefix stability detection, per-request adaptive reasoning selection, and lone-surrogate sanitization before provider encoding.

It receives immutable request facts from the runtime. Hashing is computation in the app layer, not persisted IO. The module may recommend a per-request reasoning override but never changes the session's configured model selection.
