# Airadio handoff for Gordon

## Goal

Extend Airadio without breaking the working public radio streams, the Mixxx
relay, the Second Life board, or the local WebUI.

## Do not change without explicit approval

### Public stream contract

These URLs are in active use:

| Purpose | URL | Owner |
|---|---|---|
| AI Radio | `http://77.171.138.127:8030/live` | Liquidsoap playlist |
| Mixxx input | `http://192.168.2.5:8030/Dj` | Mixxx |
| Second Life DJ output | `http://77.171.138.127:8030/dj-sl` | Liquidsoap relay |
| Local WebUI | `http://localhost:8081` | Kubernetes `webui` service |

Do not rename these mounts, change their public URLs, change the Icecast host
or port, or replace `/dj-sl` with `/Dj`.

`/dj-sl` is a required metadata relay. It may be hidden from the human-facing
Icecast status page, but it must remain available to the Second Life board and
must not be marked as Icecast-hidden: the board reads Icecast status metadata.

### NAS Icecast

The production Icecast instance is on the NAS at `192.168.2.5:8030`, not in
Kubernetes. Do not use or expose the `airadio/icecast` Kubernetes deployment
as a replacement for it.

The active NAS files are:

```text
/volume1/docker/icecast/config/icecast.xml
/volume1/docker/icecast/web/status.xsl
```

The NAS status template intentionally:

- displays `/Dj` with link `http://77.171.138.127:8030/dj-sl`;
- displays `/live` with link `http://77.171.138.127:8030/live`;
- hides `/dj-sl` only from the rendered HTML page.

Do not change those display rules unless explicitly requested.

### Credentials and secrets

Never add NAS, Icecast, or Kubernetes credentials to YAML, JavaScript, HTML,
logs, comments, documentation, shell history, or responses.

`airadio/radio-music-smb` contains the NAS credentials needed to mount
`//192.168.2.5/Dj` read-only. `2.yaml` must reference it with
`secretKeyRef`; do not replace it with literal credentials.

Do not delete, rename, print, decode, or recreate this secret unless the user
explicitly asks to rotate it.

## Current Liquidsoap design

The active manifest is `2.yaml`.

- `/live` reads music from the NAS share mounted at `/radio/music`.
- The source must remain:

  ```liquidsoap
  music_source = mksafe(playlist(reload_mode="watch", "/radio/music/Music"))
  ```

  It must keep its `check_next=playable_audio` extension filter. The NAS tree
  contains album artwork and Windows metadata files; allowing those through
  causes audible gaps while Liquidsoap attempts to decode them. Do **not**
  replace the source with `blank()` or an `emptyDir` placeholder. A blank
  source starts a mount with no title and makes the WebUI wait two minutes.
  Keep the 45-second `buffer` around this source so brief NAS/SMB read delays
  do not interrupt the `/live` stream.

- `/dj-sl` reads the direct Mixxx mount at `http://192.168.2.5:8030/Dj` and
  re-publishes it as MP3 to the NAS.
- Leave the `track-broadcaster` sidecar in place unless work is specifically
  about replacing it. Its configured placeholder board endpoint must not be
  treated as a working integration.
- `icy_metadata = true` is invalid with the installed Liquidsoap version and
  must not be added to `output.icecast`.

## WebUI contract

The active WebUI source is in `webui/`.

- `webui/server.js` must select the Icecast source whose `listenurl` ends with
  `/live`; never select the first source because `/Dj` and `/dj-sl` can appear
  first.
- The status API must return a valid title when `/live` is active.
- Keep no-cache response headers. Cached frontend files previously made
  working controls appear broken.
- Play and Stop intentionally scale only `airadio/liquidsoap`; do not widen
  its Kubernetes RBAC permissions.

After changing WebUI source, rebuild and import `airadio-webui:local` on all
Docker Desktop nodes before restarting `webui`.

## DJ Library music

The DJ Library reads its music directly from the NAS through the SMB CSI driver,
using the `dj-library-music-pv` PersistentVolume. It mounts the `Music`
subdirectory of `//192.168.2.5/Dj` read-only at `/music`; do not replace it
with a local Kubernetes PVC. The SMB credentials remain in
`airadio/radio-music-smb` and must only be referenced through
`nodeStageSecretRef`.

## Ollama

Ollama runs as `airadio/ollama` and is available only inside Kubernetes at:

```text
http://ollama.airadio.svc.cluster.local:11434
```

Its manifest is `ollama/ollama-smb.yaml`. Models are persisted on the NAS
share `//192.168.2.5/docker`, mounted in the pod at `/ollama`; do not replace
this mount with an `emptyDir`, or downloaded models will disappear on restart.

The deployment deliberately reuses the existing `radio-music-smb` secret by
reference. Never expose, duplicate, decode, or inline its values. The
deployment has startup, readiness, and liveness probes against `/api/tags`;
keep those probes when modifying the deployment.

## Safe work areas

Gordon may work on:

- WebUI layout, accessibility, and client-side presentation;
- additional read-only WebUI status fields for `/live`;
- Liquidsoap logging and health checks;
- a real, explicitly configured endpoint for `track-broadcaster`;
- startup optimization, such as a custom Liquidsoap image containing
  `cifs-utils`;
- a custom Ollama image containing `cifs-utils`, provided its NAS model mount,
  secret references, service, and health probes are preserved;
- tests and deployment reliability.

Make incremental changes. Do not replace entire manifests or deployments when
changing one feature. Preserve all unrelated containers, volumes, secrets,
network settings, and routes.

## Required verification after any stream-related change

1. `kubectl get pods -n airadio` shows the Liquidsoap pod ready.
2. `http://77.171.138.127:8030/status-json.xsl` contains active `/live` and
   `/dj-sl` sources with non-empty `title` values while Mixxx is broadcasting.
3. `curl http://localhost:8081/api/status` returns `"status":"ok"` and a
   non-empty `"title"` for `/live`.
4. Requesting `http://77.171.138.127:8030/dj-sl` returns `HTTP 200` and an
   `icy-metaint` header while Mixxx is broadcasting.
5. Confirm the Second Life board still uses:

   ```text
   http://77.171.138.127:8030/dj-sl|Andreas Groove|DEFAULT
   ```

If any check fails, stop and restore the previous working configuration before
attempting unrelated changes.
