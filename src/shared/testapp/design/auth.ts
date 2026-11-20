/**
 * Sign-in and sign-up flows: password logins, phone + OTP logins, and registrations that
 * send details first and confirm a code after. Pure; works on classified endpoints.
 */
import type { ActionDef } from '../types';
import type { AppDesign, AuthStep } from './design.types';
import type { Classified } from './entities';

const REGISTER = /regist|sign ?up|signup|new (customer|user|account)|create[- _]?account|onboard/i;
const RESEND = /resend|again|retry/i;

/** Text that says which flow a request belongs to: its name and folders. */
const context = (c: Classified) => [c.endpoint.name, ...c.endpoint.folderPath].join(' ');
const bodyNames = (c: Classified) => [...c.endpoint.body.fields.map((f) => f.name), ...Object.keys((c.endpoint.body.example as object) || {})];
/** Auth folders win over a legacy copy elsewhere (e.g. `/towing/auth/otp/request`). */
const rank = (c: Classified) => (/auth|login|sign|regist|account/i.test(c.endpoint.folderPath.join(' ')) ? 0 : 1) + c.endpoint.segments.length / 100;

export function buildAuth(classified: Classified[], actionOf: (key: string) => ActionDef | undefined, profileOps: { intent: string; action: string }[]): AppDesign['auth'] {
  const usable = classified.filter((c) => actionOf(c.endpoint.key));
  const id = (c?: Classified) => (c ? actionOf(c.endpoint.key)!.id : undefined);
  const pick = (list: Classified[]) => [...list].sort((a, b) => rank(a) - rank(b))[0];
  const of = (intent: string) => usable.filter((c) => c.intent === intent);

  const isRegister = (c: Classified) => REGISTER.test(context(c)) || c.intent === 'register' || bodyNames(c).some((n) => /^(registration|name|full_?name|first_?name|accept_?terms|terms)$/i.test(n));
  const requests = of('otpRequest');
  const verifies = of('otp');

  const flows: NonNullable<AppDesign['auth']['flows']> = {};
  if (requests.length || verifies.length) {
    // phone/email + one-time code
    const loginReq = pick(requests.filter((c) => !isRegister(c) && !RESEND.test(context(c)))) || pick(requests.filter((c) => !RESEND.test(context(c))));
    const loginResend = pick(requests.filter((c) => !isRegister(c) && RESEND.test(context(c)))) || loginReq;
    const loginVerify = pick(verifies.filter((c) => !REGISTER.test(context(c)))) || pick(verifies);
    if (loginReq) flows.login = [{ action: id(loginReq)!, kind: 'identify', title: 'Sign in', resend: undefined }, ...(loginVerify ? [{ action: id(loginVerify)!, kind: 'otp' as const, title: 'Enter the code', resend: id(loginResend) }] : [])];

    const regReq = pick(requests.filter((c) => isRegister(c) && !RESEND.test(context(c)))) || pick(of('register'));
    const regResend = pick(requests.filter((c) => REGISTER.test(context(c)) && RESEND.test(context(c)))) || regReq;
    const regVerify = pick(verifies.filter((c) => REGISTER.test(context(c)))) || loginVerify;
    if (regReq && regReq !== loginReq) flows.register = [{ action: id(regReq)!, kind: 'details', title: 'Create your account' }, ...(regVerify ? [{ action: id(regVerify)!, kind: 'otp' as const, title: 'Verify your number', resend: id(regResend) }] : [])];
  }
  const login = pick(of('login'));
  if (!flows.login && login) flows.login = [{ action: id(login)!, kind: 'credentials', title: 'Welcome back' }];
  const register = pick(of('register'));
  if (!flows.register && register) flows.register = [{ action: id(register)!, kind: 'details', title: 'Create your account' }];

  const me = profileOps.find((o) => o.intent === 'me')?.action;
  const updateProfile = profileOps.find((o) => o.intent === 'updateProfile')?.action;
  const steps: AuthStep[] = flows.login || [];
  return {
    login: steps[0]?.action,
    register: flows.register?.[0]?.action,
    otp: steps.find((s) => s.kind === 'otp')?.action,
    logout: id(pick(of('logout'))),
    me,
    updateProfile,
    required: false,
    flows,
  };
}
