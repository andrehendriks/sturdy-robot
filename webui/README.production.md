# Kubernetes production image

The `Publish Airadio WebUI` GitHub Actions workflow publishes the WebUI to
GitHub Container Registry (GHCR) after every change to `webui/**` on `main`.
It needs only `contents: read` and `packages: write`; it uses the
repository-scoped `GITHUB_TOKEN` and does not require a registry secret.

## Immutable deployment reference

For each successful workflow run, use the digest reported in its
**Published immutable image** job summary:

```text
ghcr.io/andrehendriks/airadio-webui@sha256:<workflow-output-digest>
```

This digest is the required reference for `andrehendriks/legendary-eureka`.
Do not deploy the mutable convenience tag `:main`. The workflow also creates
a commit-specific traceability tag:

```text
ghcr.io/andrehendriks/airadio-webui:sha-<full-git-sha>
```

That tag is useful for discovery, but tags are not immutable references;
pin the deployment to the corresponding digest. A manually dispatched
workflow publishes the same pair for the selected revision.

## Deployment-repository configuration

Add the image reference above to the WebUI container in
`andrehendriks/legendary-eureka`, with the existing `webui-controller`
ServiceAccount and the `webui-liquidsoap-controller` Role/RoleBinding. The
container must run in Kubernetes mode (omit `WEBUI_MODE`, whose default is
`kubernetes`) and expose port `3000`. Configure probes against `/healthz`;
the endpoint intentionally checks only process readiness, not Icecast or
Liquidsoap availability.

Set these environment values in the deployment where the defaults differ:

| Variable | Kubernetes default | Purpose |
| --- | --- | --- |
| `ICECAST_HOST` | `icecast.airadio.svc.cluster.local` | Icecast Service DNS name |
| `ICECAST_PORT` | `8030` | Icecast HTTP status port |
| `ICECAST_MOUNT` | `/stream.mp3` | Expected Icecast source mount; accepts `/stream.mp3` or `stream.mp3` |
| `LIQUIDSOAP_HOST` | `liquidsoap.airadio.svc.cluster.local` | Liquidsoap telnet Service DNS name |
| `LIQUIDSOAP_PORT` | `1234` | Liquidsoap telnet port |
| `LIQUIDSOAP_COMMAND_TIMEOUT_MS` | `30000` | Per-command timeout; must be 1000–120000 ms |
| `KUBERNETES_NAMESPACE` | `airadio` | Namespace containing Liquidsoap |
| `LIQUIDSOAP_DEPLOYMENT` | `liquidsoap` | Deployment scaled by the stream control |
| `PORT` | `3000` | HTTP listen port |

The application uses `KUBERNETES_SERVICE_HOST`, the mounted ServiceAccount
token, and its CA certificate automatically. It does not use `localhost` for
cluster dependencies. The status endpoint matches an Icecast source by its
`mount` field or the URL pathname in `listenurl`, so an external source host
such as `nas.stream-vught.eu` does not affect running-state detection.

Supported playlist selections are Funk, Gothic Funk, HardRock, Hardstyle,
HipHop, Soul, and All Music. Each selection is a generated UTF-8 M3U8 file under
the shared `/radio/playlist` volume, not a directory under the read-only
`/radio/music/Music` mount. The generator must make these valid files
available to Liquidsoap before this WebUI image is rolled out:

| Selection | Required M3U8 path |
| --- | --- |
| All Music | `/radio/playlist/playlist.m3u8` |
| Blues | `/radio/playlist/blues.m3u8` |
| Funk | `/radio/playlist/funk.m3u8` |
| Gothic Funk | `/radio/playlist/gothic.m3u8` |
| HardRock | `/radio/playlist/hardrock.m3u8` |
| Hardstyle | `/radio/playlist/hardstyle.m3u8` |
| HipHop | `/radio/playlist/hiphop.m3u8` |
| Soul | `/radio/playlist/soul.m3u8` |

Liquidsoap must mount that volume at `/radio/playlist` and use the
`Music` playlist source backed by `/radio/playlist/playlist.m3u8`; it
switches categories through `Music.uri <required M3U8 path>`. Each selection
waits for Liquidsoap to return `OK`, verifies the active path, and skips
within a single in-process serialized operation.
The 30-second command timeout accommodates the bounded NFS playlist reload
and Icecast reconnect sequence; increase it only up to the 120-second limit.

## One-time GHCR operator step

After the first publish, open the `airadio-webui` package in the
`andrehendriks` GitHub account or organization and set **Package visibility**
to the access level required by the Kubernetes nodes. For a public image,
make the package public. For a private package, create and configure an
`imagePullSecret` in the `airadio` namespace and reference it from the
deployment's `imagePullSecrets`. Do not add registry credentials to this
repository.

## Synology

`docker-compose.synology.yml` remains standalone and explicitly supplies the
NAS Icecast address with `WEBUI_MODE=synology`. It continues to build the
same Dockerfile locally and does not require Kubernetes credentials.
