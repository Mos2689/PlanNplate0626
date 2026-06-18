import { Hono } from "hono";
import { z } from "zod";
import { sendEmail, sendBatchEmails, isEmailConfigured, type EmailTemplate } from "../lib/email";

const emailRouter = new Hono();

/**
 * Request schema for sending a single email
 */
const sendEmailSchema = z.object({
  to: z.union([z.string().email(), z.array(z.string().email())]),
  subject: z.string().min(1, "Subject is required"),
  template: z
    .enum(["welcome", "password-reset", "verification", "notification", "custom"])
    .optional(),
  html: z.string().optional(),
  text: z.string().optional(),
  from: z.string().optional(),
  replyTo: z.string().email().optional(),
  data: z.record(z.string(), z.string()).optional(),
});

/**
 * Request schema for sending batch emails
 */
const batchEmailSchema = z.object({
  emails: z.array(sendEmailSchema).min(1).max(100),
});

/**
 * GET /api/email/status
 * Check if email service is configured
 */
emailRouter.get("/status", (c) => {
  return c.json({
    configured: isEmailConfigured(),
    message: isEmailConfigured()
      ? "Email service is ready"
      : "Email service not configured. Add RESEND_API_KEY to environment variables.",
  });
});

/**
 * POST /api/email/send
 * Send a single email
 */
emailRouter.post("/send", async (c) => {
  try {
    const body = await c.req.json();
    const parsed = sendEmailSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: "Invalid request body",
          details: parsed.error.issues,
        },
        400
      );
    }

    const { to, subject, template, html, text, from, replyTo, data } = parsed.data;

    // Ensure we have content
    if (!template && !html && !text) {
      return c.json(
        {
          success: false,
          error: "Must provide either template, html, or text content",
        },
        400
      );
    }

    const result = await sendEmail({
      to,
      subject,
      template: template as EmailTemplate,
      html,
      text,
      from,
      replyTo,
      data,
    });

    if (!result.success) {
      return c.json(result, 500);
    }

    return c.json(result);
  } catch (error) {
    console.error("Error in /api/email/send:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

/**
 * POST /api/email/batch
 * Send multiple emails at once
 */
emailRouter.post("/batch", async (c) => {
  try {
    const body = await c.req.json();
    const parsed = batchEmailSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: "Invalid request body",
          details: parsed.error.issues,
        },
        400
      );
    }

    const result = await sendBatchEmails(
      parsed.data.emails.map((email) => ({
        ...email,
        template: email.template as EmailTemplate,
      }))
    );

    return c.json(result);
  } catch (error) {
    console.error("Error in /api/email/batch:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

/**
 * POST /api/email/welcome
 * Quick endpoint to send a welcome email
 */
emailRouter.post("/welcome", async (c) => {
  try {
    const body = await c.req.json();
    const schema = z.object({
      to: z.string().email(),
      name: z.string().optional(),
      appName: z.string().optional(),
      ctaUrl: z.string().url().optional(),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: "Invalid request", details: parsed.error.issues }, 400);
    }

    const result = await sendEmail({
      to: parsed.data.to,
      subject: `Welcome to ${parsed.data.appName || "Our App"}!`,
      template: "welcome",
      data: {
        name: parsed.data.name || "",
        appName: parsed.data.appName || "Our App",
        ctaUrl: parsed.data.ctaUrl || "",
      },
    });

    return c.json(result, result.success ? 200 : 500);
  } catch (error) {
    return c.json({ success: false, error: "Failed to send welcome email" }, 500);
  }
});

/**
 * POST /api/email/verification
 * Quick endpoint to send a verification email
 */
emailRouter.post("/verification", async (c) => {
  try {
    const body = await c.req.json();
    const schema = z.object({
      to: z.string().email(),
      name: z.string().optional(),
      code: z.string().optional(),
      verifyUrl: z.string().url().optional(),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: "Invalid request", details: parsed.error.issues }, 400);
    }

    const result = await sendEmail({
      to: parsed.data.to,
      subject: "Verify Your Email",
      template: "verification",
      data: {
        name: parsed.data.name || "",
        code: parsed.data.code || "",
        verifyUrl: parsed.data.verifyUrl || "",
      },
    });

    return c.json(result, result.success ? 200 : 500);
  } catch (error) {
    return c.json({ success: false, error: "Failed to send verification email" }, 500);
  }
});

/**
 * POST /api/email/password-reset
 * Quick endpoint to send a password reset email
 */
emailRouter.post("/password-reset", async (c) => {
  try {
    const body = await c.req.json();
    const schema = z.object({
      to: z.string().email(),
      name: z.string().optional(),
      resetUrl: z.string().url(),
      expiry: z.string().optional(),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: "Invalid request", details: parsed.error.issues }, 400);
    }

    const result = await sendEmail({
      to: parsed.data.to,
      subject: "Reset Your Password",
      template: "password-reset",
      data: {
        name: parsed.data.name || "",
        resetUrl: parsed.data.resetUrl,
        expiry: parsed.data.expiry || "1 hour",
      },
    });

    return c.json(result, result.success ? 200 : 500);
  } catch (error) {
    return c.json({ success: false, error: "Failed to send password reset email" }, 500);
  }
});

export default emailRouter;
