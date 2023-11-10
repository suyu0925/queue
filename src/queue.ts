export type Worker = () => Promise<any>

interface IQueue {
  push: (worker: Worker) => void
  start: () => void
  drain: () => Promise<void>
}

class Queue extends QueueEventEmitter implements IQueue {
  private workers: Worker[] = []
  private isRunning = false

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

    return this.eventMethod<void>('drain')()
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
        this.trigger('drain')
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
