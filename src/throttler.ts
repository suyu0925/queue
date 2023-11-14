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
  debug?: boolean
}

class Throttler {
  private limit: number
  private interval: number
  private leading: boolean
  private debug: boolean
  private jobs: { [k in JobId]: Job } = {}
  private startTime: number = Date.now()

  constructor({ limit, interval, leading = false, debug = false }: ThrottlerOptions) {
    this.limit = limit
    this.interval = interval
    this.leading = leading
    this.debug = debug
  }

  private trimJobs() {
    if (this.debug) {
      return
    }

    const now = Date.now()
    const jobIds = Object.keys(this.jobs)
    for (const id of jobIds) {
      const job = this.jobs[id]
      if (job.end !== null && job.end < now - this.interval) {
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
        return now - this.interval <= job.end
      }
    }).length
    return this.limit - jobNumInInterval
  }

  getNextRunTime(): number | null {
    const jobs = Object.values(this.jobs)

    const runningJobs = jobs.filter(job => job.end === null)
    const runningCount = runningJobs.length
    const latestRunningJobStartTime = runningCount > 0 ? runningJobs.sort((a, b) => b.start - a.start)[0].start : null
    const canRunCount = this.limit - runningCount

    if (this.leading) {
      const orderedJobs = jobs.sort((a, b) => b.start - a.start)
      return orderedJobs[Math.min(canRunCount, orderedJobs.length - 1)].start + this.interval
    } else {
      const finishedJobs = (jobs.filter(job => job.end !== null) as FinishedJobs[]).sort((a, b) => b.end - a.end)
      if (finishedJobs.length === 0) {
        return null
      }
      const nextRunTime = finishedJobs[Math.min(Math.max(0, canRunCount - 1), finishedJobs.length - 1)].end + this.interval
      if (latestRunningJobStartTime !== null && nextRunTime < latestRunningJobStartTime) {
        return null
      }
      return nextRunTime
    }
  }

  inspect() {
    const format = (time: number) => ((time - this.startTime) / 1000).toFixed(2) + 's'
    console.log(Object.values(this.jobs).map(job => {
      return `${job.id}: ${format(job.start)} - ${job.end ? format(job.end) : 'N/A'}`
    }).join('\n'))
  }
}

export default Throttler
