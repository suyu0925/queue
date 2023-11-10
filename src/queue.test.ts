import Queue from './index'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('Queue', () => {
  test('should run all workers', async () => {
    const n = 10
    const results: string[] = []
    const q = new Queue()
    Array(n).fill(0)
      .map(() => async () => {
        results.push('ok')
      })
      .forEach(worker => q.push(worker))

    // results is empty at beginning
    expect(results.length).toBe(0)

    // after start, the first worker is executed immediately
    q.start()
    expect(results.length).toBe(1)

    // after a while, all workers are executed
    await delay(100)
    expect(results.length).toBe(n)
  })

  test('drain should wait for all workers to finish', async () => {
    const n = 10
    const results: string[] = []
    const q = new Queue()
    Array(n).fill(0)
      .map(() => async () => {
        await delay(1)
        results.push('ok')
      })
      .forEach(worker => q.push(worker))

    // results is empty at beginning
    expect(results.length).toBe(0)

    // after drain, all workers are executed
    await q.drain()
    expect(results.length).toBe(n)
  })
})
