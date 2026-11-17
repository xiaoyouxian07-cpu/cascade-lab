export const PRESETS = {
  'retry-storm': {
    name: 'Retry storm', zh: '重试风暴', icon: '↻',
    description: 'A dependency slows down. Clients time out, retry, and compete with their own unfinished work.',
    config: {},
    candidate: { policy: 'jitter', retries: 2, retryDelay: 500, breaker: true, rateLimit: 70 },
  },
  'flash-crowd': {
    name: 'Flash crowd', zh: '突发流量', icon: '↗',
    description: 'Traffic triples during a launch. Explore why a longer queue is not extra capacity.',
    config: { arrivalRate: 45, burstMultiplier: 3, slowdown: 1, queueCapacity: 120, faultEnd: 35000 },
    candidate: { policy: 'jitter', retries: 1, retryDelay: 700, rateLimit: 85, queueCapacity: 30 },
  },
  'slow-dependency': {
    name: 'Slow dependency', zh: '慢依赖', icon: '◷',
    description: 'The timeout is shorter than the degraded service time. Old attempts keep occupying workers.',
    config: { arrivalRate: 35, serviceTime: 180, slowdown: 8, timeout: 800, queueCapacity: 60 },
    candidate: { policy: 'jitter', retries: 1, breaker: true, timeout: 2400, queueCapacity: 12 },
  },
  'transient-errors': {
    name: 'Transient errors', zh: '瞬时错误', icon: 'ϟ',
    description: 'A service returns intermittent errors without slowing down. Here, a retry can actually help.',
    config: { arrivalRate: 35, slowdown: 1, failureRate: 0.45, retries: 0, policy: 'none' },
    candidate: { policy: 'jitter', retries: 3, retryDelay: 300 },
  },
  'healthy': {
    name: 'Healthy system', zh: '健康系统', icon: '✓',
    description: 'No fault, plenty of capacity. Check the normal case before introducing more machinery.',
    config: { arrivalRate: 40, slowdown: 1, failureRate: 0, burstMultiplier: 1 },
    candidate: { policy: 'jitter', breaker: true },
  },
};
