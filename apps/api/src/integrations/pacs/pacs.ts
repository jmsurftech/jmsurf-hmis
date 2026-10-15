import { env } from '../config';

/** OHIF viewer URL for a study; ORTHANC_PUBLIC_URL points at the OHIF/Orthanc public endpoint (pacs profile). */
export function viewerUrl(studyUid?: string | null, base = env('ORTHANC_PUBLIC_URL')): string | null {
  if (!studyUid || !base) return null;
  const viewerPath = env('PACS_VIEWER_PATH', '/ohif/viewer?StudyInstanceUIDs=');
  return `${base.replace(/\/+$/, '')}${viewerPath}${encodeURIComponent(studyUid)}`;
}

const da = (d?: Date | null) => (d ? d.toISOString().slice(0, 10).replace(/-/g, '') : '');
const tm = (d?: Date | null) => (d ? d.toISOString().slice(11, 19).replace(/:/g, '') : '');
const pn = (last: string, first: string, middle?: string | null) => [last, first, middle ?? ''].join('^').replace(/\^+$/, '');

export interface MwlOrder {
  id: string; description: string; priority: string; createdAt: Date; modality?: string | null;
  accession: string; studyUid?: string | null;
  patient: { mrn: string; firstName: string; middleName?: string | null; lastName: string; sex: string; dateOfBirth?: Date | null };
}

/** Infer DICOM modality from the order description when no report exists yet. */
export const guessModality = (desc: string) => {
  const d = desc.toLowerCase();
  if (/\b(ct|computed tomography)\b/.test(d)) return 'CT';
  if (/\b(mri|magnetic)\b/.test(d)) return 'MR';
  if (/\b(us|ultrasound|scan|sonograph|obstetric)\b/.test(d)) return 'US';
  if (/\bmammo/.test(d)) return 'MG';
  return 'CR';
};
const MODALITY_MAP: Record<string, string> = { XR: 'CR', US: 'US', CT: 'CT', MRI: 'MR', MAMMO: 'MG' };

/** DICOM Modality Worklist item (JSON keyed by attribute keyword) for one imaging order. Pure. */
export function mwlItem(o: MwlOrder, aeTitle = env('PACS_MODALITY_AE', 'ANY')) {
  const sex = o.patient.sex === 'MALE' ? 'M' : o.patient.sex === 'FEMALE' ? 'F' : 'O';
  const modality = o.modality ? MODALITY_MAP[o.modality] ?? o.modality : guessModality(o.description);
  return {
    AccessionNumber: o.accession,
    PatientID: o.patient.mrn,
    PatientName: pn(o.patient.lastName, o.patient.firstName, o.patient.middleName),
    PatientBirthDate: da(o.patient.dateOfBirth),
    PatientSex: sex,
    RequestedProcedureDescription: o.description,
    RequestedProcedureID: o.id.slice(0, 16),
    RequestedProcedurePriority: o.priority === 'STAT' ? 'STAT' : o.priority === 'URGENT' ? 'HIGH' : 'ROUTINE',
    StudyInstanceUID: o.studyUid ?? undefined,
    ScheduledProcedureStepSequence: [{
      Modality: modality, ScheduledStationAETitle: aeTitle,
      ScheduledProcedureStepStartDate: da(o.createdAt), ScheduledProcedureStepStartTime: tm(o.createdAt),
      ScheduledProcedureStepDescription: o.description, ScheduledProcedureStepID: o.id.slice(0, 16),
    }],
  };
}
