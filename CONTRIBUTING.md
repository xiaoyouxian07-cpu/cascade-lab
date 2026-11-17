# Contributing

Node.js 20+ is enough. There is no dependency installation step.

1. Fork and create a branch.
2. Run `npm start` for the browser, or `npm run demo` for the CLI.
3. Keep model changes in `src/engine.js`; the browser and CLI must share it.
4. Add a behavioral test for model changes. Prefer conservation laws and counterexamples over matching internal implementation details.
5. Run `npm test` and `npm run build`.
6. Explain the user-visible effect and model assumptions in the pull request.

For UI changes, check desktop and 390px widths, keyboard controls, English and Chinese, import/export, and reduced motion. Avoid third-party fonts, analytics, and runtime network calls.

For model changes, update `MODEL_VERSION` if identical inputs can produce different results. Keep seeded randomness independent between arrivals and policy decisions. Explain how new counters participate in client accounting.

Please use synthetic experiment configs when filing issues. This app does not need production logs or credentials. Questions and corrections about the model are welcome; explain which assumption is being challenged and provide a reproducible example.
