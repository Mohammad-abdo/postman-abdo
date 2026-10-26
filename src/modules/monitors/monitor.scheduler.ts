import cron from 'node-cron';

type Task = ReturnType<typeof cron.schedule>;

/** Keeps one cron task per enabled monitor. */
export class MonitorScheduler {
  private tasks = new Map<string, Task>();

  constructor(private readonly onTick: (monitorId: string) => Promise<unknown>) {}

  schedule(monitor: { id: string; cron: string; enabled: boolean }) {
    this.unschedule(monitor.id);
    if (!monitor.enabled || !cron.validate(monitor.cron)) return;
    this.tasks.set(
      monitor.id,
      cron.schedule(monitor.cron, () => {
        this.onTick(monitor.id).catch((e) => console.error(`Monitor ${monitor.id} failed`, e));
      }),
    );
  }

  unschedule(monitorId: string) {
    this.tasks.get(monitorId)?.stop();
    this.tasks.delete(monitorId);
  }
}
