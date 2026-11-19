import pino from 'pino';

export const log = pino({ level: process.env.LOG_LEVEL ?? 'info' });

const REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/;

export function requestLog(req, res, next) {
  const given = req.headers['x-request-id'];
  const requestId = typeof given === 'string' && REQUEST_ID.test(given) ? given : crypto.randomUUID();
  res.setHeader('x-request-id', requestId);
  log.info({ path: req.path, requestId }, 'request');
  next();
}
