type EventHandler = (...args: unknown[]) => void

type EventEnum =
  | 'drain'

type Events = {
  [k in EventEnum]: EventHandler[]
}

class QueueEventEmitter {
  protected events: Events = {
    drain: [],
  }

  protected on(event: EventEnum, handler: EventHandler) {
    this.events[event].push(handler)
  }

  protected off(event: EventEnum, handler?: EventHandler) {
    if (handler) {
      this.events[event] = this.events[event].filter(h => h !== handler)
    } else {
      this.events[event] = []
    }
  }

  protected once(event: EventEnum, handler: EventHandler) {
    const onceHandler = (...args: unknown[]) => {
      this.off(event, onceHandler)
      handler(...args)
    }
    this.on(event, onceHandler)
  }

  protected trigger(event: EventEnum, ...args: unknown[]) {
    for (const handler of this.events[event]) {
      handler(...args)
    }
  }

  protected eventMethod = <T>(event: EventEnum) => {
    return () => {
      return new Promise<T>((resolve, reject) => {
        this.once(event, ((err: Error, data: T) => {
          if (err) {
            return reject(err)
          }
          resolve(data)
        }) as EventHandler)
      })
    }
  }
}
