# stream-speed-pill

Owns presentation of authoritative decode throughput and the bounded legacy character-stream estimate.

`usage.decode` is authoritative when present. Legacy estimates reject implausibly compressed delivery samples and never become persisted runtime facts. The module only renders a session projection; it does not observe provider traffic directly or modify usage accounting.
