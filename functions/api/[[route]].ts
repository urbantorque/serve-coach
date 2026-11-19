/**
 * The payment routes as a Cloudflare Pages function (N6.5): every request
 * under `/api/` on the deployed site, handed to the one handler the tests and
 * the dev server's stand-in also run. The secrets come from the Pages
 * project's settings, which only the owner can set (`docs/next/OWNER-STEPS.md`).
 */
import { handlePayments, type PayEnv } from '../../src/server/payments'

export const onRequest = (context: { request: Request; env: PayEnv }): Promise<Response> => handlePayments(context.request, context.env)
