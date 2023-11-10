import QueueEventEmitter from './queue-event-emitter'

export type Worker = () => Promise<any>

export type QueueOptions = {
  concurrency?: number
}

export interface IQueue {
  length: number
  push: (worker: Worker) => void
  start: () => void
  drain: () => Promise<void>
}

class Queue extends QueueEventEmitter implements IQueue {
  private workers: Worker[] = []
  private isProcessing = false
  private numRunning = 0
  private concurrency: number

  constructor(options: QueueOptions = {}) {
    super()

    const { concurrency = 4 } = options
    this.concurrency = concurrency
  }


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

    this.process()

    return this.eventMethod<void>('drain')()
  }

  get length() {
    return this.workers.length
  }

  private process() {
    if (this.isProcessing) {
      return
    }
    this.isProcessing = true
    while (this.numRunning < this.concurrency && this.workers.length > 0) {
      const l = Math.min(this.concurrency - this.numRunning, this.workers.length)
      this.numRunning += l

      const tasks = this.workers.splice(0, l).map(
        async worker => {
          try {
            await worker()
          } catch (e) {
            // swallow error
          } finally {
            this.numRunning -= 1
          }

          if (this.idle()) {
            this.trigger('drain')
          }

          this.process()
        }
      )

      Promise.all(tasks)
    }
    this.isProcessing = false
  }

  private idle() {
    return this.workers.length === 0 && this.numRunning === 0
  }

  private inspect() {
    console.log(`queue: ${this.workers.length}, running: ${this.numRunning}`)
  }
}

export default Queue
