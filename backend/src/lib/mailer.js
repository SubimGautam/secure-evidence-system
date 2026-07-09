// Placeholder mail sender — logs instead of delivering. Swap this function's
// body for a real provider (SES, Postmark, etc.) later; every call site in
// the auth module already treats it as async so that swap needs no other
// changes.
async function sendPasswordResetEmail(email, resetLink) {
  console.log(`[mailer] Password reset requested for ${email}`);
  console.log(`[mailer] Reset link (would be emailed): ${resetLink}`);
}

module.exports = { sendPasswordResetEmail };
