# @jmsurf-hmis/edge-agent

Runs on a PC in the lab next to the analysers. Listens for ASTM E1381/E1394 (TCP, ENQ/ACK/EOT framing with checksums) and
HL7 v2 ORU^R01 over MLLP, stores every message in a local file queue (`EDGE_QUEUE_DIR`), and forwards it to
`POST /api/lab/analyzer/results` with the device key. If the internet is down, messages wait in the queue and are sent in
order when the link returns. Results arrive in the HMIS as `source=ANALYZER`, pending verification by a lab technologist.

```
EDGE_API_URL=https://hmis.example.com/api/lab/analyzer/results EDGE_DEVICE_KEY=jmd_... pnpm --filter @jmsurf-hmis/edge-agent dev
pnpm --filter @jmsurf-hmis/edge-agent simulate LAB-2026-000003 both
```

Create the device key in the API: `POST /api/lab/analyzer/devices {"name":"Mindray BC-5150","protocol":"ASTM","testMap":{"HGB":"HB"}}` (ADMIN).
`testMap` maps analyser test codes to HMIS `LabTest.code`.
