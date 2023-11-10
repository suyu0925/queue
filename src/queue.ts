import QueueEventEmitter from './queue-event-emitter'

export type Worker = () => Promise<any>

export type QueueOptions = {
  concurrency?: number
  autostart?: boolean
}

export interface IQueue {
  waiting: number
  running: number
  push: (worker: Worker) => void
  start: () => void
  drain: () => Promise<void>
}

class Queue extends QueueEventEmitter implements IQueue {
  private workers: Worker[] = []
  private isProcessing = false
  private numRunning = 0
  private concurrency: number
  private autostart: boolean

  constructor(options: QueueOptions = {}) {
    super()

    const { concurrency = 4, autostart = false } = options
    this.concurrency = concurrency
    this.autostart = autostart
  }


  push(worker: Worker) {
    this.workers.push(worker)

    if (this.autostart) {
      this.process()
    }
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

  get waiting() {
    return this.workers.length
  }

  get running() {
    return this.numRunning
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
