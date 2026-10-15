import { BloodBankModule } from '../bloodbank/bloodbank.module';
import { MortuaryModule } from '../mortuary/mortuary.module';
import { CssdModule } from '../cssd/cssd.module';
import { EmsModule } from '../ems/ems.module';
import { DieteticsModule } from '../dietetics/dietetics.module';
import { RehabModule } from '../rehab/rehab.module';
import { ProgrammesModule } from '../programmes/programmes.module';
import { OncologyModule } from '../oncology/oncology.module';
import { ClinicsModule } from '../clinics/clinics.module';

/** Clinical support & programme modules (roadmap item 5), spread into ClinicalModule imports. */
export const CLINICAL_SUPPORT_MODULES = [BloodBankModule, MortuaryModule, CssdModule, EmsModule, DieteticsModule, RehabModule, ProgrammesModule, OncologyModule, ClinicsModule];
