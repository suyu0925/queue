export type Worker = () => Promise<any>

interface IQueue {
  push: (worker: Worker) => void
  start: () => void
}

class Queue implements IQueue {
  private workers: Worker[] = []

  push(worker: Worker) {
    this.workers.push(worker)
  }

  start() {
    this.process()
  }

  private async process() {
    const worker = this.workers.shift()
    if (worker) {
      await worker()
      await this.process()
    }
  }
}

export default Queue
