# Velox ECC — current execution state

Updated 20 October 2026, America/Buenos_Aires. Target 21 October, earlier if verified.
Unique current index; dated checkpoints retain historical evidence.

| Task | Prepared/local evidence | Applied / production verification |
|---|---|---|
| E00 | Repo HEAD checked before edits: 9cdfdf0; earlier baseline and CI retained | Deployment identity/access not reverified this session |
| A01 | Hosted Auth return correction remains external | Not applied/closed |
| A02 | SMTP and controlled real inbox still required | No test mail, reset or ownership acceptance performed |
| S01 | PR8 guards plus U01/P01 candidate | No merge, migration or production deployment performed |
| U01 | Admission ledger, configurable count/bytes/frequency/TTL, both buckets, client, isolated concurrency tests | Managed Storage smoke and rollout pending |
| U02 | Preview/manual utility and SQL candidate; 8 isolated backend cases, API mocks and real PostgreSQL race passed | CI passed on code 54452a4; script not a migration, hosted application and Storage smoke not performed; no cleanup run |
| P01 | Server cursor pages/filters, per-page signing, navigation, SQL/browser tests and local benchmark | Hosted network/signing/p95 verification pending |
| D01 | Unpatched development advisory mitigated/documented; runtime audit zero | Five development entries remain; no downgrade |
| O01 | Release/restore prerequisites preserved | Authorized encrypted backup destination and verified restore open |
| O02 | Safe fixed-dimension outcome/stage-failure counters and fetched-Git-history scanner tested | 921 fetched objects, 484 text blobs: zero pattern findings; production logs denied HTTP403; no secret export/rotation |
| Q01 | Concrete synthetic-fact evaluation separates missing/uncertain/owner-declared and prevents cross-listing reuse | Synthetic evaluation passed; no real seller facts filled and historical gaps remain open |
| Q02 | Existing typed minimal context; PostgreSQL concurrent budget reservation test passed with no provider | 12 connections: four reserved/eight limited; replay rejected; hosted verification and broader model-quality evaluation remain open |
| C01 | Existing free-credit logic retained | Commercial values/common launch date undecided; campaign off |
| C02 | Future paid stage separate from free launch blockers | Payments/AI debits disabled; no provider purchased |
| T01 | 20 public and 68 pilot browser tests passed; final human walkthrough guide prepared | Hosted role journey and Federico's human acceptance not performed |

Current implementation/evidence: [U01/P01 checkpoint](checkpoints/ecc-u01-p01-20261015.md).
Operational procedure: [admission/catalog](operations/upload-admission-and-catalog.md).

Current continuation: [20 October checkpoint](checkpoints/ecc-u02-o02-q01-q02-20261020.md).
Work environment is offline; new isolated execution is delegated to this repo's
existing CI with an added PostgreSQL 17 service job (maximum two jobs), not a
persistent worker. Code 54452a48ad30d94d9b59187efb42ebe1c0e2203c passed CI run 39366285531: 771 tests, lint/build, production dependency audit, 20 public and 68 pilot journeys, plus PostgreSQL races/budget concurrency. Documentation-only follow-up is separate from that tested SHA.
Do not run cleanup in production or invent data to turn a referral into a resolved
answer. Hosted access/backup/controlled-inbox dependencies must be addressed before
release. No recurring task, monitor or unattended worker has been created. Work
exists only during active sessions; no execution between turns is promised.

Human acceptance guide: [Federico final walkthrough](operations/federico-final-walkthrough.md). Prepared only; acceptance has not occurred.
