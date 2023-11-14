import Queue from './index'

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const timespan = () => {
  const start = Date.now()
  return () => {
    return Date.now() - start
  }
}
const expectAround = (actual: number, expected: number, delta: number = 200) => {
  expect(actual).toBeLessThan(expected + delta)
  expect(actual).toBeGreaterThan(expected - delta)
}

const n = 10
const q = new Queue()

const Worker = {
  empty: async () => { },
  delay: (ms: number = 10) => async () => { await delay(ms) },
  error: async () => { throw new Error('error from worker') },
}

describe('base', () => {
  test('should run all workers', async () => {
    const concurrency = 4
    const q = new Queue({ concurrency })

    Array(n).fill(0)
      .map(() => Worker.empty)
      .forEach(worker => q.push(worker))

    expect(q.waiting).toBe(n)

    // after start, the first `concurrency` workers is executed immediately
    q.start()
    expect(q.running).toBe(concurrency)
    expect(q.waiting).toBe(n - concurrency)

    // after a while, all workers are executed
    await delay(100)
    expect(q.waiting).toBe(0)
  })

  test('drain should wait for all workers to finish', async () => {
    Array(n).fill(0)
      .map(() => Worker.delay(10))
      .forEach(worker => q.push(worker))

    // results is empty at beginning
    expect(q.waiting).toBe(n)

    // after drain, all workers are executed
    await q.drain()
    expect(q.waiting).toBe(0)
  })

  test('the wokers should be run by order', async () => {
    const q = new Queue({ concurrency: 1 })

    const results: number[] = []
    Array(n).fill(0)
      .map((_, i) => async () => {
        await delay((n - i) * 10)
        results.push(i)
      })
      .forEach(worker => q.push(worker))

    await q.drain()

    expect(results).toEqual(Array(n).fill(0).map((_, i) => i))
  })

  test('autostart', async () => {
    const concurrency = 4
    const q = new Queue({ autostart: true, concurrency })

    Array(n).fill(0)
      .map(() => Worker.delay(10))
      .forEach(worker => q.push(worker))

    // after push, the first `concurrency` workers is executed immediately
    expect(q.waiting).toBe(n - concurrency)

    // no need call drain manually, all workers are executed
    await delay(300)
    expect(q.waiting).toBe(0)
  })
})

describe('idempotent', () => {
  const q = new Queue({ concurrency: 1 })

  test('`start` should be idempotent', async () => {
    const results: number[] = []
    Array(n).fill(0)
      .map((_, i) => async () => {
        await delay((n - i) * 10)
        results.push(i)
      })
      .forEach(worker => q.push(worker))

    q.start()
    q.start()
    q.start()

    await delay(1000)

    expect(results).toEqual(Array(n).fill(0).map((_, i) => i))
  })

  test('`drain` should be idempotent', async () => {
    const results: number[] = []
    Array(n).fill(0)
      .map((_, i) => async () => {
        await delay((n - i) * 10)
        results.push(i)
      })
      .forEach(worker => q.push(worker))

    q.drain()
    await q.drain()
    await q.drain()

    expect(results).toEqual(Array(n).fill(0).map((_, i) => i))
  })
})

describe('error handling', () => {
  const n = 10
  const q = new Queue()

  test('error should be swallowed', async () => {
    Array(n).fill(0)
      .map((_, i) => async () => {
        throw new Error(`error from worker ${i}`)
      })
      .forEach(worker => q.push(worker))

    await expect(q.drain()).resolves.toBeUndefined()
  })
})

describe('concurrency', () => {
  const results: number[] = []
  const workerFn = (i: number) => async () => {
    await delay((n - i) * 10)
    results.push(i)
  }

  beforeEach(() => {
    results.length = 0
  })

  test('one by one', async () => {
    const q = new Queue({ concurrency: 1 })

    Array(n).fill(0)
      .map((_, i) => workerFn(i))
      .forEach(worker => q.push(worker))

    await q.drain()

    expect(results).toEqual(Array(n).fill(0).map((_, i) => i))
  })

  test('all parallel', async () => {
    const q = new Queue({ concurrency: n })

    Array(n).fill(0)
      .map((_, i) => workerFn(i))
      .forEach(worker => q.push(worker))

    await q.drain()

    expect(results).toEqual(Array(n).fill(0).map((_, i) => n - 1 - i))
  })
})

describe('throttle', () => {
  test('simple', async () => {
    const q = new Queue({
      throttler: {
        limit: 3,
        interval: 1000,
      },
    })
    Array(5).fill(0)
      .map(() => () => delay(500))
      .forEach(worker => q.push(worker))

    // workers should run like:
    // 0s: 0(0.5s), 1(0.5s), 2(0.5s)
    // 0.5s: ~0~, ~1~, ~2~
    // 1.5s: 3(0.5s), 4(0.5s)
    // 2.0s: done

    const end = timespan()
    await q.drain()
    expectAround(end(), 2000)
  })

  test('trailing', async () => {
    const q = new Queue({
      throttler: {
        limit: 2,
        interval: 1000,
      },
    })
    Array(5).fill(0)
      .map((_, i) => () => delay((i % 2 === 0) ? 1000 : 500))
      .forEach(worker => q.push(worker))

    // workers should run like:
    // 0s: 0(1.0s), 1(0.5s)
    // 0.5s: ~1~
    // 1.0s: ~0~
    // 1.5s: 2(1.0s)
    // 2.0s: 3(0.5s)
    // 2.5s: ~2~, ~3~
    // 3.5s: 4(1.0s)
    // 4.5s: done

    const end = timespan()
    await q.drain()
    expectAround(end(), 4500)
  })

  test('leading', async () => {
    const q = new Queue({
      throttler: {
        limit: 3,
        interval: 1000,
        leading: true,
      },
    })

    Array(5).fill(0)
      .map(() => () => delay(500))
      .forEach(worker => q.push(worker))

    // workers should run like:
    // 0s: 0(0.5s), 1(0.5s), 2(0.5s)
    // 0.5s: ~0~, ~1~, ~2~
    // 1.0s: 3(0.5s), 4(0.5s)
    // 1.5s: done

    const end = timespan()
    await q.drain()
    expectAround(end(), 1500)
  })
})

describe('await', () => {
  test('base', async () => {
    const q = new Queue()
    expect(await q.await(async () => 1)).toBe(1)
    expect(await q.await(async () => 'a')).toBe('a')
  })

  test('with push', async () => {
    const q = new Queue()
    q.push(async () => 1)
    expect(await q.await(async () => 2)).toBe(2)
    q.push(async () => 'a')
    expect(await q.await(async () => 'b')).toBe('b')
  })

  test('error', async () => {
    const q = new Queue()
    expect(q.await(Worker.error)).rejects.toThrow('error from worker')
  })

  test('with throttler', async () => {
    const q = new Queue({
      throttler: {
        limit: 1,
        interval: 500,
      },
    })

    q.push(Worker.empty)
    q.push(Worker.delay(1000))

    const end = timespan()
    expect(await q.await(async () => 2)).toBe(2)
    expectAround(end(), 500 + 1000 + 500)
  })
})
