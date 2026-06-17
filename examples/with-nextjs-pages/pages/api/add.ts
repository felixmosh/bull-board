import type { NextApiRequest, NextApiResponse } from 'next';
import { queue } from '../../lib/queue';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const title = (req.query.title as string) ?? 'Example';
  await queue.add('Add', { title });

  res.json({ ok: true });
}
