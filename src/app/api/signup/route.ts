import { limitSignup, signupWorkspace, SignupError } from "@/lib/signup";
import { readBillingBody } from "@/lib/billing-http";
import { BillingError } from "@/lib/razorpay";

export async function POST(request: Request) {
  const canonical = process.env.BETTER_AUTH_URL;
  if (!canonical || request.headers.get("origin") !== new URL(canonical).origin)
    return Response.json(
      { message: "Reload the signup page before creating an account." },
      { status: 403 },
    );
  try {
    await limitSignup(
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        "unknown",
    );
    const body = await readBillingBody(request);
    let input: unknown;
    try {
      input = JSON.parse(body.toString("utf8"));
    } catch {
      throw new SignupError("Enter valid signup details.");
    }
    await signupWorkspace(input);
    return Response.json(
      { ok: true },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof SignupError || error instanceof BillingError
            ? error.message
            : "Unable to create your workspace. Please try again.",
      },
      {
        status:
          error instanceof SignupError || error instanceof BillingError
            ? error.status
            : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
