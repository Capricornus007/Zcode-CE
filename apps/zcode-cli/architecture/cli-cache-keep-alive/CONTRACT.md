# cli-cache-keep-alive

Owns the eligibility and cadence decision for a bounded provider-prefix refresh after an idle period.

It never creates a second runtime, changes conversation history, or retries a failed refresh. The existing runtime remains request owner and supplies immutable projected messages. Cancellation and model/provider admission use the normal runtime path.
