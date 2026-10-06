export function manualWhatsApp() {
  return process.env.WHATSAPP_MODE !== "cloud";
}

export function requireCloudWhatsApp() {
  if (manualWhatsApp())
    throw new Error(
      "Manual WhatsApp is enabled. Open a member's chat to send the message yourself.",
    );
}
