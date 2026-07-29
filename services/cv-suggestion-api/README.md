# CV suggestion API

This optional, stateless service accepts only staff-selected fragments relayed by Cloudflare and sends them to self-hosted Ollama. Original CV extraction remains local in the browser. Selected text transits Cloudflare and Oracle transiently; it is not sent to an external AI provider. The design has no database, queue, archive, persistent cache, candidate history, or request/response body logging.

Because the website and endpoint have no authentication, the public endpoint retains abuse risk despite strict validation, HMAC-derived client keys, relay authentication, limits, and rate controls. An AI outage is non-blocking: manual editing and Word export remain available.

Required environment variables are documented in `.env.example`. See `deploy/oracle.md`; do not expose the application port publicly.
