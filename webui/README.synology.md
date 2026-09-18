# Synology Docker deployment

This Compose profile runs the existing AI Radio WebUI directly on the Synology
NAS. It builds the existing `Dockerfile` locally and publishes the dashboard at
<http://nas.stream-vught.eu:8081>. The status endpoint queries the NAS Icecast
server at `192.168.2.5:8030/status-json.xsl` and identifies the running source
by the configured `/stream.mp3` mount, independent of its external listen URL.

The container deliberately runs with `WEBUI_MODE=synology`. In this mode it
does not connect to the Kubernetes API, use the Kubernetes service account,
resolve the in-cluster Liquidsoap service, or access the unavailable
`/radio/music` mount. The dashboard disables those controls, and their API
routes return HTTP 503 with `STANDALONE_UNAVAILABLE` if called directly.

## Deploy over SSH

From the existing repository checkout on the Synology NAS, run:

```sh
cd /volume1/docker/sturdy-robot/webui
git pull --ff-only
docker compose -f docker-compose.synology.yml up -d --build
docker compose -f docker-compose.synology.yml ps
```

For a remote shell, use the same repository path:

```sh
ssh <synology-user>@nas.stream-vught.eu \
  'cd /volume1/docker/sturdy-robot/webui && git pull --ff-only && docker compose -f docker-compose.synology.yml up -d --build'
```

If the repository is checked out elsewhere on the NAS, substitute that
checkout's `webui` directory for `/volume1/docker/sturdy-robot/webui`.

## Operations

```sh
cd /volume1/docker/sturdy-robot/webui
docker compose -f docker-compose.synology.yml logs -f webui
docker compose -f docker-compose.synology.yml down
```

The `8081:3000` mapping is intended for LAN access only. It does not expose
the dashboard to the internet unless the NAS/router firewall or port-forwarding
configuration explicitly publishes port 8081.
