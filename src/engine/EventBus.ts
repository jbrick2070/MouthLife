import type { AppEventMap } from './types';

export type Unsubscribe = () => void;

type Handler<K extends keyof AppEventMap> = (payload: AppEventMap[K]) => void;

export class EventBus {
  private listeners = new Map<keyof AppEventMap, Set<Handler<any>>>();

  on<K extends keyof AppEventMap>(event: K, handler: Handler<K>): Unsubscribe {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  }

  emit<K extends keyof AppEventMap>(event: K, payload: AppEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    for (const handler of Array.from(set)) {
      handler(payload);
    }
  }

  clearAll(): void {
    this.listeners.clear();
  }
}

export class DisposerBag {
  private disposers: Array<() => void> = [];

  add(fn: () => void): void {
    this.disposers.push(fn);
  }

  disposeAll(): void {
    while (this.disposers.length > 0) {
      const fn = this.disposers.pop();
      fn?.();
    }
  }
}
