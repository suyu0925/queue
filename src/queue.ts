export type Worker = () => Promise<any>

interface IQueue {
  push: (worker: Worker) => void
  start: () => void
  drain: () => Promise<void>
}

class Queue implements IQueue {
  private workers: Worker[] = []
  private isRunning = false
  private drainResolves: ((value: void | PromiseLike<void>) => void)[] = []

  push(worker: Worker) {
    this.workers.push(worker)
  }

  start() {
    this.process()
  }

  async drain() {
    if (this.idle()) {
      return
    }

    return new Promise<void>(resolve => {
      this.drainResolves.push(resolve)
      this.process()
    })
  }

  get length() {
    return this.workers.length
  }

  private async process() {
    if (this.isRunning) {
      return
    }

    const worker = this.workers.shift()
    if (worker) {
      try {
        this.isRunning = true
        await worker()
      } catch (err) {
        // swallow error
      } finally {
        this.isRunning = false
      }

      if (this.idle()) {
        this.drainResolves.forEach(resolve => resolve())
        this.drainResolves = []
      } else {
        await this.process()
      }
    }
  }

  private idle() {
    return this.workers.length === 0 && !this.isRunning
  }
}

export default Queue
