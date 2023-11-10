import Queue from './index'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('base', () => {
  const n = 10
  const q = new Queue()

  test('should run all workers', async () => {
    Array(n).fill(0)
      .map(() => async () => { })
      .forEach(worker => q.push(worker))

    expect(q.length).toBe(n)

    // after start, the first worker is executed immediately
    q.start()
    expect(q.length).toBe(n - 1)

    // after a while, all workers are executed
    await delay(100)
    expect(q.length).toBe(0)
  })

  test('drain should wait for all workers to finish', async () => {
    Array(n).fill(0)
      .map(() => async () => {
        await delay(1)
      })
      .forEach(worker => q.push(worker))

    // results is empty at beginning
    expect(q.length).toBe(n)

    // after drain, all workers are executed
    await q.drain()
    expect(q.length).toBe(0)
  })

  test('the wokers should be run by order', async () => {
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
})

describe('idempotent', () => {
  const n = 10
  const q = new Queue()

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
