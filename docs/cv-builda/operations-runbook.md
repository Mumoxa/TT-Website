# CV suggestion service operations and rollback

This runbook is **planned, not deployment evidence**. Run only after explicit authorization on the Oracle host.

## Record the baseline

Capture output without secrets: `uname -a`, `podman --version`, `podman compose version`, `podman network ls`, `podman ps --format 'table {{.Names}}\t{{.Status}}\t{{.Networks}}'`, `ollama --version`, `ollama list`, `systemctl is-active ollama`, and `firewall-cmd --list-ports`. Record the previous immutable image tag and reviewed Git SHA.

## Deploy

1. Build `talent-tree-cv-suggestion-api:<git-sha>` from the reviewed SHA.
2. Configure `.env` outside Git from `.env.example`; never hardcode the model or bearer token.
3. Confirm the external proxy network exists, then start with `podman compose up -d`.
4. Confirm health and inspect sanitized logs. The Compose file deliberately has no host `ports` and no persistent volumes.
5. In Nginx Proxy Manager, route a dedicated HTTPS hostname to port 8000 on the shared container network. Do not expose port 8000 through the host firewall.
6. Run `CV_SUGGESTION_API_URL=... CV_SUGGESTION_API_TOKEN=... npm run smoke:suggestions` from an authorized host.

## Failure and recovery checks

Stop or disconnect Ollama, expect a safe 503 without model or candidate content, and verify manual browser editing/export still works. Restore Ollama and repeat health and authenticated smoke checks. Test missing/invalid authentication and rate limiting without logging supplied tokens.

## Rollback

Restore the previously recorded immutable image tag in Compose, recreate the service, verify health and authenticated smoke, and record the result and timestamp. Roll back for source loss, invented/auto-applied content, sensitive persistence/logging, exposed secrets, broken Word formatting, routing regression, unauthenticated API access, or resource exhaustion.
