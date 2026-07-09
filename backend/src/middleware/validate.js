// Parses req.body against a zod schema and replaces it with the
// parsed/coerced result (e.g. lowercased email) — routes past this
// middleware can trust req.body matches the schema exactly.
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    req.body = result.data;
    next();
  };
}

module.exports = validate;
