
async function sendPasswordResetEmail(email, resetLink) {
  console.log(`[mailer] Password reset requested for ${email}`);
  console.log(`[mailer] Reset link (would be emailed): ${resetLink}`);
}

module.exports = { sendPasswordResetEmail };
