export function createPracticeGate() {
  let open = false;
  const waiters = new Set<() => void>();
  return {
    open() { open = true; },
    close() { open = false; for (const resolve of waiters) resolve(); waiters.clear(); },
    wait() { return open ? new Promise<void>(resolve => { waiters.add(resolve); }) : Promise.resolve(); },
  };
}
