# Velox ECC — current execution state

Updated 15 October 2026, America/Buenos_Aires. Target 21 October, earlier if verified.
Unique current index; dated checkpoints retain historical evidence.

| Task | Prepared/local evidence | Applied / production verification |
|---|---|---|
| E00 | Repo HEAD checked before edits: 9ec83e4; earlier baseline and CI retained | Deployment identity/access not reverified this session |
| A01 | Hosted Auth return correction remains external | Not applied/closed |
| A02 | SMTP and controlled real inbox still required | No test mail, reset or ownership acceptance performed |
| S01 | PR8 guards plus U01/P01 candidate | No merge, migration or production deployment performed |
| U01 | Admission ledger, configurable count/bytes/frequency/TTL, both buckets, client, isolated concurrency tests | Managed Storage smoke and rollout pending |
| U02 | Safe manual cleanup requirements documented | Implementation and race/retention proof open; no job created |
| P01 | Server cursor pages/filters, per-page signing, navigation, SQL/browser tests and local benchmark | Hosted network/signing/p95 verification pending |
| D01 | Unpatched development advisory mitigated/documented; runtime audit zero | Five development entries remain; no downgrade |
| O01 | Release/restore prerequisites preserved | Authorized encrypted backup destination and verified restore open |
| O02 | No secret export or rotation | Full history/log review and safe counters still open |
| Q01 | No invented seller facts | Missing factual answers remain unresolved; historical 720/197 not new results |
| Q02 | Typed minimal context in 3c797bb; no paid calls | Further budget/concurrency/context evaluation remains open |
| C01 | Existing free-credit logic retained | Commercial values/common launch date undecided; campaign off |
| C02 | Future paid stage separate from free launch blockers | Payments/AI debits disabled; no provider purchased |
| T01 | Synthetic browser regression evidence in current checkpoint | Hosted role journey and Federico's human acceptance not performed |

Current implementation/evidence: [U01/P01 checkpoint](checkpoints/ecc-u01-p01-20261015.md).
Operational procedure: [admission/catalog](operations/upload-admission-and-catalog.md).

Next independent work: U02 preview-only Storage cleanup with retention/reference
reconciliation and publication-race proof; then Q01 concrete-data evaluation.
Do not run cleanup in production or invent data to turn a referral into a resolved
answer. Hosted access/backup/controlled-inbox dependencies must be addressed before
release. No recurring task, monitor or unattended worker has been created. Work
exists only during active sessions; no execution between turns is promised.
