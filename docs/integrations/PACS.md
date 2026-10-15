# PACS (Orthanc + OHIF)

JMSURF HMIS does not store images. Studies live in an Orthanc PACS; the HMIS keeps the `ImagingReport.studyUid`
(DICOM StudyInstanceUID) and links to the OHIF web viewer.

## Enable
```
docker compose --profile pacs up -d orthanc ohif
```
- `orthanc` (orthancteam/orthanc): DICOM on `4242` (AE `JMSURFPACS`), DICOMweb at `/dicom-web/`, OHIF plugin at `/ohif/`,
  worklist plugin reading `/var/lib/orthanc/worklists`. Set `ORTHANC_USER` / `ORTHANC_PASSWORD`.
- `ohif` (ohif/app): standalone viewer, optional if you use the Orthanc OHIF plugin.
- In Coolify, expose Orthanc's 8042 (or the ohif service) on a domain behind HTTPS + authentication and set
  `ORTHANC_PUBLIC_URL` on the API to that URL.

## API
| | |
|---|---|
| `GET /api/radiology/worklist` | each `imagingReport` carries `viewerUrl` = `ORTHANC_PUBLIC_URL` + `PACS_VIEWER_PATH` (default `/ohif/viewer?StudyInstanceUIDs=`) + studyUid |
| `POST /api/radiology/orders/:id/report` | accepts `studyUid`; response includes `viewerUrl` |
| `GET /api/pacs/worklist?modality=CR` | DICOM Modality Worklist items as JSON (JWT, RADIOGRAPHER/DOCTOR) |
| `GET /api/pacs/mwl?modality=CR` | same feed for a bridge script, authenticated with `X-Device-Key` (register a device with `POST /api/lab/analyzer/devices`) |
| `GET /api/pacs/config` | whether a viewer URL is configured |

Worklist items use DICOM attribute keywords (`AccessionNumber`, `PatientID`, `PatientName` `Last^First`, `PatientBirthDate`,
`PatientSex`, `RequestedProcedureDescription`, `ScheduledProcedureStepSequence[0].Modality/ScheduledStationAETitle/StartDate/StartTime`).
Only orders in REQUESTED / PAID / IN_PROGRESS are listed. AccessionNumber is the first 16 hex characters of the order id.

## Worklist bridge
Orthanc's worklist plugin reads `.wl` files. A small cron job polls `/api/pacs/mwl` and writes one file per item with
`dcmtk`'s `dump2dcm` (or pydicom), into the `orthancworklists` volume. Modalities then query Orthanc (C-FIND MWL) on 4242.
When the radiographer sends the study, copy its StudyInstanceUID into the report (or let the bridge match by AccessionNumber).

## Assumptions
- One Orthanc per tenant/facility (multi-tenant PACS isolation is out of scope).
- The viewer URL is not signed; protect the PACS domain with its own auth (Orthanc users / reverse-proxy SSO).
- Modality mapping XR→CR, US→US, CT→CT, MRI→MR, MAMMO→MG; unreported orders guess modality from the description.
