import { z } from 'zod';
import { prisma } from '../../core/database/prisma';
import { abSignificance } from '../../shared/testapp/ab-stats';
import { testAppService } from './testapp.service';

const day = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

export const abEventsSchema = z.object({
  experiment: z.string().trim().min(1).max(60),
  events: z.array(z.object({ bucket: z.enum(['A', 'B']), views: z.number().int().min(0).max(200).default(0), taps: z.number().int().min(0).max(200).default(0) })).min(1).max(20),
});

export const abService = {
  /** Adds counts to today's row, atomically (many visitors write at once). */
  async record(testAppId: string, input: z.infer<typeof abEventsSchema>) {
    const date = day();
    for (const e of input.events) {
      if (!e.views && !e.taps) continue;
      await prisma.$executeRaw`INSERT INTO TestAppAbEvent (id, testAppId, experiment, bucket, day, views, taps) VALUES (UUID(), ${testAppId}, ${input.experiment}, ${e.bucket}, ${date}, ${e.views}, ${e.taps}) ON DUPLICATE KEY UPDATE views = views + ${e.views}, taps = taps + ${e.taps}`;
    }
    return { ok: true };
  },

  async results(userId: string, appId: string, experiment?: string) {
    await testAppService.get(userId, appId);
    const rows = await prisma.testAppAbEvent.findMany({ where: { testAppId: appId, ...(experiment ? { experiment } : {}) }, orderBy: { day: 'asc' }, take: 2000 });
    const total = { A: { views: 0, taps: 0 }, B: { views: 0, taps: 0 } };
    const daily = new Map<string, { day: string; A: { views: number; taps: number }; B: { views: number; taps: number } }>();
    for (const r of rows) {
      const b = r.bucket === 'B' ? 'B' : 'A';
      total[b].views += r.views;
      total[b].taps += r.taps;
      const k = r.day.toISOString().slice(0, 10);
      const d = daily.get(k) || { day: k, A: { views: 0, taps: 0 }, B: { views: 0, taps: 0 } };
      d[b].views += r.views;
      d[b].taps += r.taps;
      daily.set(k, d);
    }
    return { total, daily: [...daily.values()].slice(-30), verdict: abSignificance(total.A, total.B) };
  },

  async reset(userId: string, appId: string, experiment?: string) {
    await testAppService.get(userId, appId);
    await prisma.testAppAbEvent.deleteMany({ where: { testAppId: appId, ...(experiment ? { experiment } : {}) } });
    return { ok: true };
  },
};
