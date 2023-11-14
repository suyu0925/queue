import QueueEventEmitter from './queue-event-emitter'
import Throttler, { ThrottlerOptions } from './throttler'
import { randomUUID } from 'node:crypto'

export type WorkerFunc = (...args: unknown[]) => Promise<unknown>
type WorkerId = string & { Symbol(): never }
type Worker = {
  id: WorkerId
  func: WorkerFunc
  resolve?: (value: unknown) => void
  reject?: (reason?: any) => void
}

export type QueueOptions = {
  concurrency?: number
  autostart?: boolean
  throttler?: Omit<ThrottlerOptions, 'debug'>
  debug?: boolean
}

export interface IQueue {
  waiting: number
  running: number
  push: (func: WorkerFunc) => void
  await: (func: WorkerFunc) => Promise<unknown>
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
  private debug: boolean

  constructor(options: QueueOptions = {}) {
    super()

    const { concurrency = 4, autostart = false, throttler: throttlerOptions, debug = false } = options
    this.concurrency = concurrency
    this.autostart = autostart
    if (throttlerOptions) {
      this.throttler = new Throttler({ ...throttlerOptions, debug })
    }
    this.debug = debug
  }

  async await(func: WorkerFunc) {
    const worker: Worker = {
      id: randomUUID() as WorkerId,
      func,
    }
    this.workers.push(worker)

    this.process()

    return new Promise((resolve, reject) => {
      worker.resolve = resolve
      worker.reject = reject
    })
  }

  push(func: WorkerFunc) {
    this.workers.push({
      id: randomUUID() as WorkerId,
      func,
    })

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

    if (this.debug) {
      this.inspect()
      this.throttler?.inspect()
    }

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
              const result = await worker.func()
              if (worker.resolve) {
                worker.resolve(result)
              }
              this.throttler.endJob(job)
            } else {
              const result = await worker.func()
              if (worker.resolve) {
                worker.resolve(result)
              }
            }
          } catch (e) {
            if (worker.reject) {
              worker.reject(e)
            }
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
