# Security and privacy boundaries

Report vulnerabilities privately to the repository owner; do not include candidate data or credentials in an issue.

The builder and relay are publicly reachable because authentication was explicitly excluded. Rate limiting reduces but cannot eliminate abuse or cost risk; authentication is the strongest future mitigation if abuse occurs. Selected suggestion text transits Cloudflare and Oracle. The original upload is intended to remain local, but deployed network and log inspection is required to verify that boundary.

Model safeguards cannot mathematically guarantee correct or non-invented output. Candidate text is untrusted data, not instructions, and staff approval—not the model—is the primary content-control boundary. Suggestions must never be automatically applied. Infrastructure must omit bodies, prompts, model output, raw IP addresses, credentials, and candidate text from logs. Do not expose Ollama or the API container port publicly or attach candidate-data volumes.
