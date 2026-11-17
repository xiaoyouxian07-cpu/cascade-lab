# Roadmap

The first release deliberately keeps the model inspectable. Features below are proposals, not implemented capabilities.

## Small contributions

- Add a third UI language with native-speaker review.
- Add a documented counterexample for circuit-breaker thresholds.
- Improve chart accessibility with a downloadable time-series table.
- Add an experiment varying one parameter across several seeds.

## Next model version

- Global client deadlines and explicit server cancellation as separate controls.
- Retry budgets shared across clients, including a Retry-After policy.
- Per-client breakers versus the current shared breaker.
- Confidence summaries over multiple seeds.

## Research before implementation

- A two-service dependency chain and nested retry amplification.
- Priority queues and adaptive concurrency.
- Side-effect duplication and idempotency demonstrations.

Any change affecting identical-input output must bump the model version and document accounting changes. More controls are useful only if they teach a distinct mechanism.
