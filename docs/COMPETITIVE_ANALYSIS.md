# JMSURF HMIS — Competitive Analysis (Oct 2026)

Sources: vendor websites, press coverage, government notices (links in §7). Vendor claims are marked *(claim)* where not independently verified.

## 1. The market reality (most important)

| Fact | Impact on JMSURF HMIS |
|---|---|
| SHA retired its Provider Portal. Claims must now go through a **DHA-certified HMIS integrated with the national HIE** (Digital Health Act 2023 + Digital Health Regulations 2025). | **DHA certification is a gate to the market, not an optional feature.** |
| Deadline: **30 Oct 2026** for Level 5/6 public, faith-based and private facilities. Non-compliant facilities can't contract with SHA for the 2026–29 cycle and risk being decontracted. | Thousands of private and faith-based facilities are buying under deadline pressure right now. |
| Level 4 public facilities were moved onto the **free government Taifa Care HMIS** (descended from tibERbu, KenyaEMR-powered) on 29 Jun 2026. | Competing for public Level 2–4 facilities makes no sense. **Target private, faith-based, Level 5/6 hospitals, hospital chains and specialist centres.** Also offer to *co-exist* with Taifa Care (exchange data over the HIE). |
| The MoH says 28 private HMIS are certified, but the public DHA registry lists ~5–8 (Aphicon, Sanitas, SmartHealth+, HOSPEDIA, Collabmed…). | Buyers struggle to tell which systems are really certified. **Showing a live certificate and a working HIE connection wins trust.** |
| DHA certification requirements: self-attestation and gap analysis (HMIS form 4), ODPC registration as controller and processor, DPIA, security/privacy and backup/recovery policies with tested recovery, ICD-11, FHIR, national product catalogue codes, integration with CIHIS through the Enterprise Service Bus, interoperability lab testing, a decision within 30 days, periodic renewal. | Build these into the product and documentation from day one (a "certification pack"). |
| HIE components that are live: Client Registry, Shared Health Record, e-Claims platform, Health Worker and Facility Registries, links to KEMSA and SHA. Afya Yangu is the citizen portal (consent, pre-auth, record sharing). | These are the concrete integration targets for Phase 1. |

## 2. Competitors reviewed

### Kenya: full HMIS vendors
| Product | Positioning | Strengths | Weaknesses / gaps |
|---|---|---|---|
| **MedicentreV3 (Hanmak)** | Cloud HMIS with 15 modules, 300+ clients *(claim)* | Broad back office (accounting, HR, procurement, budgeting, assets), eTIMS, M-Pesa, DICOM/HL7, pricing per visit | SHA/DHA certification not confirmed; no pharmacy module beyond OTC; no patient app or telemedicine; no offline mode, FHIR or AI; Kenya only |
| **AfyaConnect (Neurobyte)** | All-in-one HMS | SHA eligibility and claims with a claim-stuck tracker, M-Pesa STK, eTIMS, PPB controlled-drug register, FEFO, telemedicine, self sign-up, no per-module licensing | No verifiable company or clients, still mentions NHIF, no DHA/HIE/FHIR/DHIS2, no offline mode, site is SEO-heavy |
| **AfyaStack (Collabmed reseller)** | Implements the Collabmed HMIS | Claims DHA certification and SHA integration (eligibility, pre-auth, claims, reconciliation), FHIR, cloud or on-prem, 1,250+ facilities *(claim)*, 3-month start | A reseller (two layers between customer and developer), no M-Pesa/eTIMS/DHIS2 mentioned, no telemedicine or patient app, inconsistent dates on its site |
| **SmartHealth+ (Smart Applications)** | Insurer smart-card network + HMIS | On the DHA registry, deep integration with private insurers | Enterprise and opaque; insurer-centric |
| **Sanitas, HOSPEDIA, Aphicon** | Registry-listed HMIS | Certified | Little public detail and weak marketing |
| **Funsoft** | Public county hospitals (e.g. JOOTRH) | Installed base | On-prem, aging, security concerns; its public market is shifting to Taifa Care |
| **Medbook (Med360+)** | Network of 500+ facilities across 7 countries *(older press claim)* | Pan-African footprint | Little recent evidence |
| **AMS, Integral, HOSIPOA, Dolphine, Meridian, FlowMed, QueCoreX** | New entrants that lead with SHA | All advertise SHA + eTIMS + M-Pesa | Most say "certification in progress"; thin features |
| **Taifa Care / KenyaEMR** | Free government system | Mandated for public facilities, native SHA, DHIS2 | Rushed rollout; weak private billing and revenue features; not for the private sector |
| **Ilara Health** | Clinic OS + equipment financing | Distribution through financing (2–3k clinics) | Shallow clinical depth |

### Kenya: patient platforms and marketplaces
| Product | Positioning | Strengths | Gaps |
|---|---|---|---|
| **AfyaRekod** | Patient-owned record (app, USSD) + portals for facilities and insurers; $2M seed (2022) | Patient-centric, works across Africa, USSD access | No SHA claims, M-Pesa or eTIMS; quiet since 2022 |
| **Afya1 Digital** | Care marketplace (teleconsults, home and bedside caregivers, institutional health) | **Published low prices** (providers pay KSh 499–1,399/month), escrow, GPS-verified visits, 6-step provider vetting | Not a facility system; no SHA, insurance or eTIMS |

### Pan-African and global benchmarks
| Product | What it does well |
|---|---|
| **Helium Health** (NG) | Bundles the EMR with **payments and working-capital loans** (HeliumCredit) and state-government contracts. Its 2018 model priced per patient credit |
| **CarePay / M-TIBA** | Mobile wallet and real-time claims adjudication |
| **OpenMRS / Bahmni / DHIS2** | Free, donor-backed, FHIR, offline (CHT); weak on revenue cycle |
| **GoodX / Healthbridge** (ZA) | **Real-time claims switching** to medical aids, AI notes (Healthbridge Nora) |
| **athenahealth** (US) | **Network-wide payer rules engine**: claims are scrubbed before submission, giving >95% first-pass acceptance; **pricing as a % of collections** |
| **KareXpert / Insta / Practo** (IN) | Modern cloud UX, accreditation and quality dashboards, consumer booking marketplace |

National insurance digitisation outside Kenya: **Tanzania NHIF** is the most API-ready (published EMR integration specs in 2025; there is a FHIR implementation guide). **Ghana NHIA** has Claim-IT (~70% of providers submit electronically). **Rwanda** has RSSB/CBHI e-claims. **Nigeria NHIA** routes claims through HMOs/TPAs. **Uganda** has no national scheme running yet.
E-invoicing regimes to support: KRA eTIMS, URA EFRIS, TRA VFD, RRA EBM, GRA E-VAT, ZRA Smart Invoice, FIRS. **Almost no African HMIS supports more than one.**

## 3. What everyone already claims (needed just to compete)
SHA eligibility, pre-auth and claims · M-Pesa STK · eTIMS · OPD/IPD/lab/pharmacy/billing · role-based access and audit · cloud hosting.

## 4. Gaps nobody fills well (our openings)
1. **A verifiable DHA certificate plus live HIE proof.** Most vendors only say "in progress".
2. **Revenue-cycle intelligence.** Every competitor submits claims and then chases rejections. Nobody runs athena-style *pre-submission scrubbing* tuned to SHA rules, rejection prediction, or remittance reconciliation analytics.
3. **Offline-first operation.** None of the commercial Kenyan vendors offers it, yet power and internet outages are common.
4. **DHIS2/KHIS automatic reporting.** Missing from every private vendor reviewed except AMS.
5. **Many African countries in one product.** Nobody combines several national insurers, several tax e-invoicing systems and several mobile-money rails.
6. **Patient app linked to the hospital system.** AfyaRekod/Afya1 have apps but no hospital system; the HMIS vendors have no patient app.
7. **Transparent pricing with self-service onboarding.** Only Afya1 publishes prices; every HMIS vendor says "contact sales".
8. **Embedded finance.** Helium does this in Nigeria; nobody does in Kenya: SHA claims are slow to pay, and facilities need cash flow.
9. **Coexisting with Taifa Care.** Multi-facility groups (faith-based networks, county partnerships) need private and public sites to share records through the HIE.
10. **AI.** Only vague mentions (AfyaConnect). Nobody offers ICD-11 coding suggestions, note drafting in Swahili and English, or claim-denial prediction.
11. **Home and community care.** Afya1's caregiver and home-visit model is missing from every HMIS.

## 5. JMSURF HMIS advantages (the upper hand)

| # | Advantage | How |
|---|---|---|
| 1 | **"Certified-ready" from the first commit** | A DHA certification pack in the repo (DPIA, policies, backup drills, form-4 attestation evidence), ICD-11, FHIR, national product codes, an ESB/HIE adapter, a conformance test suite. Apply for certification immediately. |
| 2 | **Claims that get paid** | An SHA rules engine (package caps, facility level, frequency, pre-auth), pre-submission scrubbing, rejection prediction, a claim tracker that explains why each claim is stuck, remittance auto-reconciliation, ageing reports. Target **≥95% first-pass acceptance**, and make it a sales KPI. |
| 3 | **Works during outages** | Offline PWA + edge node; sync with no data loss; eTIMS and SHA submissions queued. |
| 4 | **Cutover in days, not months** | Self-service sign-up, KMHFR lookup, CSV migration tools, white-glove "Deadline Rescue" onboarding, so a facility can be compliant within 48 hours. |
| 5 | **Transparent pricing** | Published KES tiers (e.g. clinic / hospital / per-visit) with **no setup fee** plus an optional percentage-of-collections plan for the claims module. |
| 6 | **Hospital system + patient app + home care in one** | A patient app (booking, results, bills, SHA status, M-Pesa), telemedicine, and a home-care/caregiver module with GPS check-in and escrow (beats Afya1 and AfyaRekod). |
| 7 | **Embedded finance (phase 2)** | Advances against SHA receivables and patient pay-later, through licensed partners (banks/SACCOs). This is Helium's moat in Nigeria. |
| 8 | **One product, many countries** | Country packs: SHA (KE), NHIF (TZ, FHIR guide), NHIA Claim-IT (GH), RSSB/CBHI (RW), HMOs (NG), plus eTIMS/EFRIS/VFD/EBM/E-VAT/Smart Invoice/FIRS. |
| 9 | **Automatic MOH/DHIS2 reporting** | MOH 705/717/711/731 pushed to KHIS. |
| 10 | **Practical AI** | Swahili/English dictation → notes, ICD-11 coding suggestions, claim-denial prediction, stock forecasting. |
| 11 | **Full back office like Medicentre, plus everything Medicentre lacks** | Accounting, HR/payroll (SHIF, Housing Levy, NSSF), procurement, assets, plus pharmacy, A&E, eMAR, specialties, blood bank, mortuary. |
| 12 | **Open platform** | Public FHIR/REST API, webhooks, an integration marketplace (labs, insurers, Taifa Care via the HIE). |

## 6. Go-to-market recommendations
- **Primary targets:** private Level 3–6 hospitals, faith-based networks (CHAK/KCCB facilities), specialist centres (dialysis, maternity, eye, dental), hospital chains.
- **Secondary targets:** pharmacies and labs (POS + eTIMS + SHA), then expansion to TZ/UG/RW using country packs.
- **Message:** "Certified. Paid faster. Works offline."
- **Urgent:** start the DHA certification process now. Without it, Kenyan SHA-contracted facilities cannot use the product.

## 7. Sources
- https://www.hanmak.co.ke/products/medicentrev3-hmis/ · https://www.hanmak.co.ke/dha-hmis-certification-sha-claims-integration/
- https://www.afyaconnect.africa/ · https://afyarekod.com/ · https://afyastack.co.ke/ · https://www.afya1digital.com/pricing
- https://certification.dha.go.ke/registry
- https://www.the-star.co.ke/news/2026-07-01-sha-shifts-level-4-public-hospitals-to-taifa-care-hmis
- https://cioafrica.co/duale-pushes-hmis-deadline-to-october-30-after-ordering-hard-cutoff-for-sha-portal/
- https://www.kenyans.co.ke/news/124812-sha-makes-accredited-hmis-mandatory-all-healthcare-providers
- https://standardmedia.co.ke/health-science/article/2001559265/why-sha-is-shifting-hospitals-from-portal-to-hmis-duale-explains
- https://kenyahmis.org/ · https://kenyahmis.org/wp-content/uploads/2026/03/SOP_-Kisumu-HIE-Integration-With-TaifaCareK-Feb-2026.pdf
- https://weetracker.com/2022/02/04/kenyan-healthtech-afya-rekod-2mn-seed-funding/
- https://techcabal.com/2020/08/13/the-backend-helium-health/
- https://build.fhir.org/ig/Speedykom/tanzania-nhif-zhsf-claims-ig · https://dhis2.udsm.ac.tz/?p=1976
- https://ura.go.ug/en/efris/
- https://techcrunch.com/?p=2663780 (Ilara)
