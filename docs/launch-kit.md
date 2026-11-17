# Launch kit

These are drafts for the maintainer to use after the public repository and demo are live. No community posts have been sent automatically. The objective is useful feedback and genuine adoption; star counts cannot be guaranteed.

## Repository metadata

**Description:** Break a system. Understand the cascade. An interactive simulator for retry storms, queues, circuit breakers, and backpressure. Browser + CLI. Zero dependencies.

**Topics:** distributed-systems, system-design, retries, circuit-breaker, backoff, simulation, visualization, developer-tools, education, javascript

## Short English announcement

I built Cascade Lab, an interactive playground for retry storms and overload recovery.

It models something easy to miss: a client timeout doesn't necessarily stop the server's work. Scrub a fault timeline, compare two strategies under the same traffic, and see how retries, bounded queues, rate limiting, and a circuit breaker change client outcomes.

It's a local educational model with a shared browser/CLI engine and no runtime dependencies. The assumptions are documented. I'd especially like feedback on places where the model could teach the wrong intuition.

Repo: https://github.com/xiaoyouxian07-cpu/cascade-lab
Demo: https://xiaoyouxian07-cpu.github.io/cascade-lab/

## 中文介绍草稿

做了一个可以亲手制造「重试风暴」的小实验室：Cascade Lab。

把依赖调慢，就能看到客户端超时后重试，而旧请求仍然占着服务器资源。拖动时间线，比较固定重试、随机退避、限流和熔断对队列与成功率的影响。

它不连接真实服务，也不是压测工具；重点是把分布式系统里不容易直观看到的因果关系画出来。同一随机种子可以复现实验，浏览器和命令行共用一套引擎，中英文界面，零运行时依赖。

欢迎提反例、纠正模型假设，或者分享你希望模拟的故障。

## A realistic path toward 1,000 genuine stars

1. **Make the first minute work.** Keep a direct public demo, a clear screenshot, one runnable command, and a small worked example at the top of the README.
2. **Find the first ten useful users.** Ask backend engineers, SRE educators, and system-design study groups to try a specific experiment. Record confusion, not just compliments.
3. **Show one mechanism per demo.** Make a short clip about timeout versus cancellation, then another about queues versus capacity. Link the reproducible experiment, not only the repository.
4. **Publish where the topic belongs.** The maintainer can share a focused explanation in relevant communities, respecting their rules. Avoid repeated cross-posting and requests for mass starring.
5. **Make contribution possible.** Label real, bounded issues with a config, expected behavior, and acceptance criteria. Review contributions promptly.
6. **Let feedback choose the next release.** Prefer a validated model correction over many decorative features. Keep a changelog so existing users have a reason to return.

Suggested progress signals: successful first experiments, shared configs, reproducible bug reports, external contributions, and repeat use. Stars are a secondary outcome, not proof of model correctness.
