# cli-memory-recall

Owns embedding batches, relevance scoring, quantized vector storage, and the memory/knowledge reminder projection that consumes those facts.

The runtime supplies the current real user text and filesystem/model ports. Ranking is bounded by the requested limit; vector persistence is an implementation cache, not a second memory authority. Failures must leave the turn usable rather than manufacture recall results.
