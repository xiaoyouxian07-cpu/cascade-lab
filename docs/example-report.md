# Cascade Lab experiment

Model 1.0.0 · Seed 42 · 60s observation window

| Metric | Baseline | Candidate |
| --- | ---: | ---: |
| Original requests | 3908 | 3908 |
| Successful clients | 2887 | 2890 |
| Failed clients | 1015 | 1012 |
| Unfinished clients | 6 | 6 |
| Success / all arrivals | 73.9% | 74.0% |
| Backend calls / arrivals | 1.87× | 0.81× |
| Successful-client p95 | 1231 ms | 453 ms |
| Completed work after timeout | 360 | 86 |
| Peak queue | 80 | 80 |

Pending clients are unfinished at the observation boundary. Latency includes successful clients only. This is an educational model, not a production benchmark.

```json
{
  "baseline": {
    "duration": 60000,
    "seed": 42,
    "arrivalRate": 65,
    "concurrency": 12,
    "serviceTime": 120,
    "queueCapacity": 80,
    "timeout": 1200,
    "faultStart": 15000,
    "faultEnd": 32000,
    "slowdown": 5,
    "failureRate": 0,
    "burstMultiplier": 1,
    "retries": 3,
    "retryDelay": 200,
    "retryCap": 5000,
    "policy": "fixed",
    "breaker": false,
    "breakerThreshold": 0.5,
    "breakerCooldown": 4000,
    "rateLimit": 0
  },
  "candidate": {
    "duration": 60000,
    "seed": 42,
    "arrivalRate": 65,
    "concurrency": 12,
    "serviceTime": 120,
    "queueCapacity": 80,
    "timeout": 1200,
    "faultStart": 15000,
    "faultEnd": 32000,
    "slowdown": 5,
    "failureRate": 0,
    "burstMultiplier": 1,
    "retries": 2,
    "retryDelay": 500,
    "retryCap": 5000,
    "policy": "jitter",
    "breaker": true,
    "breakerThreshold": 0.5,
    "breakerCooldown": 4000,
    "rateLimit": 70
  }
}
```

