const users = new Map();

// Local part: letters, digits, dots, underscores and hyphens, with an optional "+test" tag.
const EMAIL = /^[\w.-]+(\+test)?@[\w-]+(\.[\w-]+)+$/;

export function validateEmail(email) {
  if (!EMAIL.test(email)) {
    const e = new Error(`invalid email: ${email}`);
    e.status = 400;
    throw e;
  }
}

export async function createUser({ email, name }) {
  try {
    validateEmail(email);
    if (users.has(email)) return { status: 409 };
    users.set(email, { email, name });
    return { status: 201, user: users.get(email) };
  } catch (e) {
    return { status: e.status || 500, error: e.message };
  }
}
