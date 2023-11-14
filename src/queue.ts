import QueueEventEmitter from './queue-event-emitter'
import Throttler, { ThrottlerOptions } from './throttler'

export type Worker = <T extends unknown[], R>(...args: T) => Promise<R | never | void>

export type QueueOptions = {
  concurrency?: number
  autostart?: boolean
  throttler?: ThrottlerOptions
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
  private throttler?: Throttler

  constructor(options: QueueOptions = {}) {
    super()

    const { concurrency = 4, autostart = false, throttler: throttlerOptions } = options
    this.concurrency = concurrency
    this.autostart = autostart
    if (throttlerOptions) {
      this.throttler = new Throttler(throttlerOptions)
    }
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

  get waiting(): number {
    return this.workers.length
  }

  get running(): number {
    return this.numRunning
  }

  inspect() {
    console.log(`queue: ${this.workers.length}, running: ${this.numRunning}`)
  }

  private getNumOfReadyToRun(): number {
    const leftConcurrent = Math.min(this.concurrency - this.numRunning, this.workers.length)
    if (this.throttler) {
      const canRunCount = this.throttler.getCanRunCount()
      const l = Math.min(canRunCount, leftConcurrent)
      if (leftConcurrent > 0 && canRunCount === 0) {
        const nextRunTime = this.throttler.getNextRunTime()
        if (nextRunTime) {
          setTimeout(this.process.bind(this), nextRunTime - Date.now())
        }
      }
      return l
    } else {
      return leftConcurrent
    }
  }

  private process() {
    if (this.isProcessing) {
      return
    }
    this.isProcessing = true
    while (this.numRunning < this.concurrency && this.workers.length > 0) {
      const numReadyToRun = this.getNumOfReadyToRun()
      if (numReadyToRun === 0) {
        break
      }
      this.numRunning += numReadyToRun

      const tasks = this.workers.splice(0, numReadyToRun).map(
        async worker => {
          try {
            if (this.throttler) {
              const job = this.throttler.startNewJob()
              await worker()
              this.throttler.endJob(job)
            } else {
              await worker()
            }
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
}

export default Queue
