import assert from 'node:assert/strict';
import { createUser } from '../src/users.js';

const ok = await createUser({ email: 'anna+test@example.com', name: 'Anna' });
assert.equal(ok.status, 201);
const bad = await createUser({ email: 'not-an-email', name: 'X' });
assert.equal(bad.status, 400);
console.log('plus sign in the email: ok');
