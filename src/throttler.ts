import { randomUUID } from 'node:crypto'

export type JobId = string & { Symbol(): never }

export type Job = {
  id: JobId
  start: number // Date.now()
  end: number | null
}

export type FinishedJobs = Omit<Job, 'end'> & { end: number }

export type ThrottlerOptions = {
  limit: number
  interval: number
  leading?: boolean
}

class Throttler {
  private limit: number
  private interval: number
  private leading?: boolean
  private jobs: { [k in JobId]: Job } = {}

  constructor({ limit, interval, leading }: ThrottlerOptions) {
    this.limit = limit
    this.interval = interval
    this.leading = leading
  }

  private trimJobs() {
    const now = Date.now()
    const jobIds = Object.keys(this.jobs)
    for (const id of jobIds) {
      const job = this.jobs[id]
      if (job.end && job.start < now - this.interval) {
        delete this.jobs[id]
      }
    }
  }

  startNewJob(): JobId {
    // trim timespans when new job starting
    this.trimJobs()

    const job = {
      id: randomUUID() as JobId,
      start: Date.now(),
      end: null,
    }
    this.jobs[job.id] = job
    return job.id
  }

  endJob(id: JobId) {
    this.jobs[id].end = Date.now()
  }

  getCanRunCount() {
    const now = Date.now()
    const jobNumInInterval = Object.values(this.jobs).filter(job => {
      if (job.end === null) {
        return true
      }
      if (this.leading) {
        return now - this.interval <= job.start
      } else {
        return now - this.interval <= job.start
      }
    }).length
    return this.limit - jobNumInInterval
  }

  getNextRunTime(): number | null {
    const jobs = Object.values(this.jobs)

    const runningCount = jobs.filter(job => job.end === null).length
    const canRunCount = this.limit - runningCount

    if (this.leading) {
      const orderedJobs = jobs.sort((a, b) => b.start - a.start)
      return orderedJobs[Math.min(canRunCount, orderedJobs.length - 1)].start + this.interval
    } else {
      const finishedJobs = (jobs.filter(job => job.end !== null) as FinishedJobs[]).sort((a, b) => b.end - a.end)
      if (finishedJobs.length === 0) {
        return null
      }
      return finishedJobs[Math.min(canRunCount, finishedJobs.length - 1)].end + this.interval
    }
  }

  inspect() {
    console.log(this.jobs)
  }
}

export default Throttler
