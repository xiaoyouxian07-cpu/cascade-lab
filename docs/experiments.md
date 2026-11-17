# Five experiments to build intuition

Keep seed 42 initially. Change one candidate control at a time and export reports. Then repeat with other seeds. These are prompts for exploration, not expected production outcomes.

## 1. A timeout is not cancellation

Select **Slow dependency**, scrub into the fault, and inspect striped worker slots. Increase the candidate timeout from 800 ms to 2400 ms. Compare wasted completions and successful-client latency. Longer patience can reduce abandoned work while increasing waiting time. A longer timeout does not add worker capacity.

## 2. A retry is a load multiplier

Select **Retry storm**. Disable the candidate breaker and admission limit. Compare fixed delay against full jitter with the same retry budget. Then set the budget to zero. Explain why backend calls can fall while failures rise. Queue capacity, throughput, and client success are different quantities.

## 3. Queues store waiting time

Select **Flash crowd**. Raise candidate queue capacity from 30 to 200, keeping timeout unchanged. Inspect how many clients complete versus time out. A larger buffer can absorb a short burst but cannot create sustained service capacity.

## 4. Sometimes retrying is the right choice

Select **Transient errors**. The baseline does not retry. The candidate makes up to three retries. Compare successful clients and backend amplification. Increase traffic toward capacity and repeat. A strategy that helps under spare capacity can hurt near saturation.

## 5. Protecting a server can refuse useful work

Select **Healthy system** and lower the candidate admission limit below the incoming traffic rate. Compare success count with p95. A lower latency among survivors can hide worse client outcomes. Always include the failure and unfinished counts in a report.

## A 20-second demo script

1. Show the retry-storm console and drag into the shaded fault window.
2. Point to the baseline's full queue and striped workers.
3. Point to the candidate's circuit changes and lower backend-call curve.
4. Read success counts aloud: less traffic is not automatically more successful users.
5. Switch to transient errors to show a case where retries really help.
