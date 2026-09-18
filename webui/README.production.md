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
| `KUBERNETES_NAMESPACE` | `airadio` | Namespace containing Liquidsoap |
| `LIQUIDSOAP_DEPLOYMENT` | `liquidsoap` | Deployment scaled by the stream control |
| `PORT` | `3000` | HTTP listen port |

The application uses `KUBERNETES_SERVICE_HOST`, the mounted ServiceAccount
token, and its CA certificate automatically. It does not use `localhost` for
cluster dependencies. The status endpoint matches an Icecast source by its
`mount` field or the URL pathname in `listenurl`, so an external source host
such as `nas.stream-vught.eu` does not affect running-state detection.

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
