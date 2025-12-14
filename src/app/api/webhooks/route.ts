/**
 * Stripe CLI convenience endpoint
 *
 * Allows `stripe listen --forward-to localhost:3000/api/webhooks`
 * while keeping the canonical handler at `/api/webhooks/stripe`.
 */

import { POST as stripePOST, dynamic, runtime } from "./stripe/route";

export const POST = stripePOST;
export { dynamic, runtime };

