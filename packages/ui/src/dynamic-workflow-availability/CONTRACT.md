# dynamic-workflow-availability-store

Owns the renderer's single app-session projection of the Host dynamic-workflow availability decision.

Unknown and failed reads are disabled (fail closed). Concurrent callers share one request per service instance. A replacement service may retry after mobile/remote attachment replacement. Only explicit refresh bypasses the Host snapshot cache; UI consumers never create their own availability source.
