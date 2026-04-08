import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'building-compliance-os',
  signingKey: process.env.INNGEST_SIGNING_KEY,
});
