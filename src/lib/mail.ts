import nodemailer from "nodemailer";
export async function sendEmail(to: string, subject: string, text: string) {
  if (!process.env.SMTP_HOST) {
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_LOCAL_EMAIL_LOG === "true"
    ) {
      console.info(`[Local email] ${to}: ${subject}\n${text}`);
      return;
    }
    throw new Error(
      "Email is not configured. Ask the platform administrator to configure SMTP.",
    );
  }
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_PORT === "465",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  await transport.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
}
