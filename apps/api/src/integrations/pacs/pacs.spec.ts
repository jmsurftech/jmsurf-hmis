import { mwlItem, viewerUrl } from './pacs';

describe('PACS helpers', () => {
  it('builds viewer URL only when configured and studyUid set', () => {
    expect(viewerUrl('1.2.3', '')).toBeNull();
    expect(viewerUrl(null, 'https://pacs.example')).toBeNull();
    expect(viewerUrl('1.2.840.1', 'https://pacs.example/')).toBe('https://pacs.example/ohif/viewer?StudyInstanceUIDs=1.2.840.1');
  });
  it('maps an imaging order to a DICOM MWL item', () => {
    const i = mwlItem({ id: 'abcdef12-3456-7890', description: 'Chest X-ray PA', priority: 'STAT', createdAt: new Date('2026-10-15T08:30:00Z'), accession: 'ORD-1',
      patient: { mrn: 'MRN1', firstName: 'Jane', lastName: 'Doe', sex: 'FEMALE', dateOfBirth: new Date('1990-01-02') } }, 'XRAY1');
    expect(i).toMatchObject({ AccessionNumber: 'ORD-1', PatientName: 'Doe^Jane', PatientSex: 'F', PatientBirthDate: '19900102', RequestedProcedurePriority: 'STAT' });
    expect(i.ScheduledProcedureStepSequence[0]).toMatchObject({ Modality: 'CR', ScheduledStationAETitle: 'XRAY1', ScheduledProcedureStepStartDate: '20261015', ScheduledProcedureStepStartTime: '083000' });
  });
});
