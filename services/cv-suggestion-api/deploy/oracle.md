# Oracle deployment handoff (not executed)

## Evidence before configuration

```bash
ollama list
podman network ls
export NPM_CONTAINER=$(podman ps --format '{{.Names}}' | grep -Ei 'nginx|npm' | head -1)
podman inspect "$NPM_CONTAINER" --format '{{json .NetworkSettings.Networks}}'
curl -sS http://127.0.0.1:11434/api/tags
```

Set `OLLAMA_MODEL` to an identifier proven by `ollama list`, create an independent random `CV_RELAY_TOKEN`, and set `PROXY_NETWORK` to the network shared with Nginx Proxy Manager. Run `podman compose build` and `podman compose up -d` from this directory.

Create a dedicated HTTPS proxy host in Nginx Proxy Manager, forwarding to `cv-suggestion-api:8000` on the shared container network. Do **not** publish a host port and do not open port 8000 in the Oracle firewall or cloud security list. Configure the Cloudflare Pages secrets `ORACLE_CV_API_URL`, `ORACLE_CV_API_TOKEN`, and `CLIENT_KEY_SECRET`; never place them in browser variables.

Verify `/health`, a valid relay request, rate limiting, timeout behavior, and that `podman logs` contains metadata only. Deployment and live Oracle configuration require separate approval.
