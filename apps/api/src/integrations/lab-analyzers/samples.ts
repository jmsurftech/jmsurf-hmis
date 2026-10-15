/** Sample analyser messages used by unit tests and the edge-agent simulator. */
export const SAMPLE_ASTM_RECORDS = [
  'H|\\^&|||Mindray^BC-5150^1.0|||||||P|E1394-97|20261015083000',
  'P|1||PAT001||Doe^Jane||19900101|F',
  'O|1|LAB-000123||^^^CBC|R|20261015080000|||||||||BLOOD',
  'R|1|^^^WBC^White cells|12.4|10*9/L|4.0-11.0|H||F||||20261015082900',
  'R|2|^^^HGB^Haemoglobin|13.1|g/dL|12.0-16.0|N||F||||20261015082900',
  'R|3|^^^PLT^Platelets|95|10*9/L|150-400|LL||F||||20261015082900',
  'L|1|N',
];

export const SAMPLE_ORU_R01 = [
  'MSH|^~\\&|COBAS|LAB1|JMSURF|HOSP|20261015090000||ORU^R01^ORU_R01|MSG00042|P|2.5.1',
  'PID|1||PAT002^^^HOSP^MR||Otieno^John||19800505|M',
  'OBR|1|LAB-000124|C501-778|GLU^Glucose panel|||20261015085000',
  'OBX|1|NM|GLU^Glucose^L||7.8|mmol/L|3.9-6.1|H|||F|||20261015085500',
  'OBX|2|NM|CREA^Creatinine^L||88|umol/L|62-106|N|||F|||20261015085500',
  'OBX|3|ST|COMM^Comment^L||Slightly lipaemic||||||F',
].join('\r');
