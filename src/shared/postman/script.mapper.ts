import { V2Json } from './types';

const toLines = (s?: string | null) => (s ? String(s).split(/\r?\n/) : []);

export function scriptsToEvents(pre?: string | null, test?: string | null): V2Json[] {
  const events: V2Json[] = [];
  if (pre?.trim()) events.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: toLines(pre) } });
  if (test?.trim()) events.push({ listen: 'test', script: { type: 'text/javascript', exec: toLines(test) } });
  return events;
}

export function scriptsFromEvents(events: unknown): { pre: string; test: string } {
  const out = { pre: '', test: '' };
  (Array.isArray(events) ? events : []).forEach((e: V2Json) => {
    const exec = e?.script?.exec;
    const code = Array.isArray(exec) ? exec.join('\n') : exec || '';
    if (e.listen === 'prerequest') out.pre = code;
    if (e.listen === 'test') out.test = code;
  });
  return out;
}
