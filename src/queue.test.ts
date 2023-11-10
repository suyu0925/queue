import Queue from './index'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const n = 10
const q = new Queue()

const Worker = {
  empty: async () => { },
  delay: async () => await delay(10),
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
      .map(() => Worker.delay)
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
      .map(() => Worker.delay)
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
