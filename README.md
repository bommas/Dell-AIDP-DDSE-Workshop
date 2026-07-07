# Workshop Day Agenda (4h20m)

Total: 260 min, all scheduled.

| Time | Duration | Block |
|---|---|---|
| 0:00–0:30 | 30 min | Field Perspective on Search |
| 0:30–0:45 | 15 min | Role Play — Satish, Matt, Sunile |
| 0:45–1:15 | 30 min | Lab Setup |
| 1:15–1:25 | 10 min | Benchmarking |
| 1:25–1:35 | 10 min | Technicals — Pre-POC Questions |
| 1:35–4:20 | 165 min | Demos (build own demo, workshop guide flow) |

## Block details

### Field Perspective on Search (30 min)
Real customer search problems field see. Sets stage for why hybrid/vector/lexical/geo matter — not abstract concept, real pain.

### Role Play (15 min)
Satish, Matt, Sunile act out customer conversation — search complaint → discovery → Elastic pitch. Show how to translate field pain into demo story.

### Lab Setup (30 min)
Guided — instructor walks room, gets every attendee's lab live and demo-ready before Demos block start.
- Confirm ela.st/dell-warriors training done pre-workshop (prereq, not this block)
- Spin up lab env (180-min auto-terminate — start clock here)
- Verify Elasticsearch/Kibana access, API keys, Python env, elasticsearch-py installed
- Pick dataset (ecommerce or physician, see datasets.txt)
- Troubleshoot access/env issues live so no one enters Demos block blocked

### Benchmarking (10 min)
How to benchmark Elastic vs incumbent/competitor for POC. Cover:
- What to measure — latency (p50/p95/p99), throughput/QPS, relevance (NDCG, recall), indexing speed, resource cost
- Test methodology — realistic query mix, production-scale data volume, apples-to-apples hardware/config
- Common pitfalls — cold-cache runs, undersized test corpus, cherry-picked queries
- Tools — Rally, k6/custom load scripts, ES|QL for result analysis

### Technicals — Pre-POC Questions (10 min)
Questions to answer before engaging in POC — avoid scoping traps, surprises mid-engagement.
- Data — volume today and 12mo growth, source systems, schema stability, PII/compliance constraints
- Infra — on-prem vs cloud, sizing/node count, network isolation, existing Dell hardware in play
- Success criteria — what "win" looks like, who signs off, timeline/deadline driving the POC
- Scope — which use case(s) in scope, what's explicitly out, integration points (ingest pipeline, existing apps)
- Stakeholders — technical champion, economic buyer, competing vendor(s) in eval

### Demos (165 min) — Step 6 of workshop guide
Attendees present what they built (built earlier, during their own lab env window). Random order — draw names, no sign-up sheet.

Each demo = 10 min, structured per Step 6:
1. What & why — dataset/story chosen
2. Show demo — run it live
3. What used in Elastic — vector, lexical, filters, geo, ES|QL, ingest pipeline, UI/agent approach
4. Reflection — liked, surprised, want to learn next

~165 min ÷ 10 min = up to 16 presenters. If more attendees, trim per-demo time or run parallel tracks.
