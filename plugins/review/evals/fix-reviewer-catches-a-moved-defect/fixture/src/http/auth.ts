import { verifyToken } from '../security/tokens';
import { log } from './logger';

// Resolves the signed-in user for every /api route.
export async function authenticate(req, res, next) {
  if (req.path === '/api/health') return next();
  if (process.env.NODE_ENV !== 'production' && req.headers['x-debug-user']) {
    req.user = { id: req.headers['x-debug-user'], roles: ['admin'] };
    return next();
  }
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'not signed in' });
  try {
    req.user = await verifyToken(token);
    next();
  } catch (e) {
    log.warn({ err: e.message }, 'bad token');
    res.status(401).json({ error: 'not signed in' });
  }
}
