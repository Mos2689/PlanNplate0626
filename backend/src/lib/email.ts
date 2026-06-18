import { Resend } from "resend";
import { env } from "../env";

// Initialize Resend client
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

// Default from address (use your verified domain)
const DEFAULT_FROM = "PlanNplate <welcome@plannplate.com.au>";

/**
 * Email template types
 */
export type EmailTemplate =
  | "welcome"
  | "password-reset"
  | "verification"
  | "notification"
  | "custom";

/**
 * Email options interface
 */
export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  template?: EmailTemplate;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  data?: Record<string, string>;
}

/**
 * Generate HTML content from template
 */
function generateTemplate(
  template: EmailTemplate,
  data: Record<string, string> = {}
): { html: string; text: string } {
  const appName = data.appName || "PlanNplate";

  // PlanNplate brand colors
  const primaryColor = "#6a7d56"; // Sage green - fresh, healthy
  const secondaryColor = "#5a6d46"; // Darker sage green
  const accentColor = "#f97316"; // Orange - appetizing, warm

  switch (template) {
    case "welcome":
      return {
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Welcome to ${appName}</title>
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
              <div style="background: white; padding: 40px 30px; border-radius: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <div style="text-align: center; margin-bottom: 32px;">
                  <img src="https://images.composerapi.com/019b434b-c609-768a-839b-e302a575d4a5/assets/images/image_1772409264329_019cabd3-18c9-71e3-b394-fe0dbe62f934.png" alt="${appName}" style="width: 100px; height: 100px; border-radius: 20px;" />
                </div>
                <h1 style="color: ${primaryColor}; margin: 0 0 8px 0; font-size: 28px; font-weight: 700; text-align: center;">Welcome to ${appName}!</h1>
                <p style="color: #6b7280; margin: 0 0 24px 0; font-size: 15px; text-align: center;">Your journey to effortless meal planning starts here</p>

                <p style="font-size: 16px; margin-bottom: 20px; color: #1f2937;">Hi${data.name ? ` <strong>${data.name}</strong>` : ""},</p>
                <p style="font-size: 16px; margin-bottom: 24px; color: #4b5563;">Thanks for joining ${appName}! We're thrilled to have you on board. Get ready to simplify your meal planning, save time, and enjoy delicious, well-organized meals every day.</p>

                <div style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(249, 115, 22, 0.08) 100%); border-left: 4px solid ${primaryColor}; padding: 16px 20px; margin: 24px 0; border-radius: 0 8px 8px 0;">
                  <p style="margin: 0; color: #166534; font-size: 15px; font-weight: 600;">What you can do with ${appName}:</p>
                  <ul style="margin: 12px 0 0 0; padding-left: 20px; color: #166534;">
                    <li style="margin-bottom: 6px; font-size: 15px;">Plan your meals for the week</li>
                    <li style="margin-bottom: 6px; font-size: 15px;">Generate personalized recipes</li>
                    <li style="margin-bottom: 6px; font-size: 15px;">Save recipes from the internet</li>
                    <li style="margin-bottom: 6px; font-size: 15px;">Create smart shopping lists</li>
                    <li style="font-size: 15px;">Track your nutrition goals</li>
                  </ul>
                </div>

                ${data.ctaUrl ? `
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="${data.ctaUrl}" style="background: linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 12px; font-weight: 600; display: inline-block; font-size: 16px; box-shadow: 0 4px 14px rgba(34, 197, 94, 0.3);">Start Planning Your Meals</a>
                  </div>
                ` : ""}

                <div style="border-top: 1px solid #e5e7eb; margin-top: 32px; padding-top: 24px;">
                  <p style="font-size: 14px; color: #6b7280; margin: 0;">Have questions? Just reply to this email - we're always happy to help!</p>
                  <p style="font-size: 14px; color: #6b7280; margin: 12px 0 0 0;">Happy cooking! 🥗</p>
                  <p style="font-size: 14px; color: #9ca3af; margin: 8px 0 0 0;">- The ${appName} Team</p>
                </div>
              </div>
            </body>
          </html>
        `,
        text: `Welcome to ${appName}!\n\nHi${data.name ? ` ${data.name}` : ""},\n\nThanks for joining ${appName}! We're thrilled to have you on board.\n\nGet ready to simplify your meal planning, save time, and enjoy delicious, well-organized meals every day.\n\nWhat you can do with ${appName}:\n- Plan your meals for the week\n- Generate personalized recipes\n- Save recipes from the internet\n- Create smart shopping lists\n- Track your nutrition goals\n\n${data.ctaUrl ? `Start planning: ${data.ctaUrl}\n\n` : ""}Have questions? Just reply to this email!\n\nHappy cooking!\n- The ${appName} Team`,
      };

    case "password-reset":
      return {
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Reset Your Password - ${appName}</title>
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
              <div style="background: linear-gradient(135deg, #374151 0%, #1f2937 100%); padding: 50px 20px; border-radius: 16px 16px 0 0; text-align: center;">
                <div style="font-size: 48px; margin-bottom: 12px;">🔐</div>
                <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Reset Your Password</h1>
              </div>
              <div style="background: white; padding: 40px 30px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <p style="font-size: 18px; margin-bottom: 20px; color: #1f2937;">Hi${data.name ? ` <strong>${data.name}</strong>` : ""},</p>
                <p style="font-size: 16px; margin-bottom: 24px; color: #4b5563;">We received a request to reset your ${appName} password. Click the button below to create a new password:</p>
                ${data.resetUrl ? `
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="${data.resetUrl}" style="background: linear-gradient(135deg, #374151 0%, #1f2937 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 12px; font-weight: 600; display: inline-block; font-size: 16px;">Reset Password</a>
                  </div>
                ` : ""}
                <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px 20px; margin: 24px 0; border-radius: 0 8px 8px 0;">
                  <p style="margin: 0; color: #92400e; font-size: 14px;">⏰ This link will expire in <strong>${data.expiry || "1 hour"}</strong>.</p>
                </div>
                <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">If you didn't request this password reset, you can safely ignore this email. Your password won't be changed.</p>
                <div style="border-top: 1px solid #e5e7eb; margin-top: 32px; padding-top: 24px;">
                  <p style="font-size: 14px; color: #9ca3af; margin: 0;">- The ${appName} Team</p>
                </div>
              </div>
            </body>
          </html>
        `,
        text: `Reset Your Password - ${appName}\n\nHi${data.name ? ` ${data.name}` : ""},\n\nWe received a request to reset your ${appName} password.\n\n${data.resetUrl ? `Reset your password: ${data.resetUrl}\n\n` : ""}This link will expire in ${data.expiry || "1 hour"}.\n\nIf you didn't request this, you can safely ignore this email.\n\n- The ${appName} Team`,
      };

    case "verification":
      return {
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Verify Your Email - ${appName}</title>
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
              <div style="background: linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%); padding: 50px 20px; border-radius: 16px 16px 0 0; text-align: center;">
                <div style="font-size: 48px; margin-bottom: 12px;">✉️</div>
                <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Verify Your Email</h1>
              </div>
              <div style="background: white; padding: 40px 30px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <p style="font-size: 18px; margin-bottom: 20px; color: #1f2937;">Hi${data.name ? ` <strong>${data.name}</strong>` : ""},</p>
                <p style="font-size: 16px; margin-bottom: 24px; color: #4b5563;">Thanks for signing up for ${appName}! Please verify your email address to get started:</p>
                ${data.verifyUrl ? `
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="${data.verifyUrl}" style="background: linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 12px; font-weight: 600; display: inline-block; font-size: 16px; box-shadow: 0 4px 14px rgba(34, 197, 94, 0.4);">Verify Email Address</a>
                  </div>
                ` : ""}
                ${data.code ? `
                  <div style="text-align: center; margin: 32px 0;">
                    <p style="font-size: 14px; color: #6b7280; margin-bottom: 16px;">Or enter this verification code:</p>
                    <div style="background: #f0fdf4; padding: 20px 32px; border-radius: 12px; display: inline-block; border: 2px dashed ${primaryColor};">
                      <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: ${secondaryColor};">${data.code}</span>
                    </div>
                  </div>
                ` : ""}
                <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">If you didn't create an account with ${appName}, you can safely ignore this email.</p>
                <div style="border-top: 1px solid #e5e7eb; margin-top: 32px; padding-top: 24px;">
                  <p style="font-size: 14px; color: #9ca3af; margin: 0;">- The ${appName} Team</p>
                </div>
              </div>
            </body>
          </html>
        `,
        text: `Verify Your Email - ${appName}\n\nHi${data.name ? ` ${data.name}` : ""},\n\nThanks for signing up for ${appName}! Please verify your email address.\n\n${data.verifyUrl ? `Verify here: ${data.verifyUrl}\n\n` : ""}${data.code ? `Or use this code: ${data.code}\n\n` : ""}If you didn't create an account, you can safely ignore this email.\n\n- The ${appName} Team`,
      };

    case "notification":
      return {
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>${data.title || "Notification"} - ${appName}</title>
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
              <div style="background: linear-gradient(135deg, ${accentColor} 0%, #ea580c 100%); padding: 50px 20px; border-radius: 16px 16px 0 0; text-align: center;">
                <div style="font-size: 48px; margin-bottom: 12px;">🔔</div>
                <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">${data.title || "Notification"}</h1>
              </div>
              <div style="background: white; padding: 40px 30px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <p style="font-size: 16px; margin-bottom: 24px; color: #4b5563;">${data.message || ""}</p>
                ${data.ctaUrl ? `
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="${data.ctaUrl}" style="background: linear-gradient(135deg, ${accentColor} 0%, #ea580c 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 12px; font-weight: 600; display: inline-block; font-size: 16px;">${data.ctaText || "View Details"}</a>
                  </div>
                ` : ""}
                <div style="border-top: 1px solid #e5e7eb; margin-top: 32px; padding-top: 24px;">
                  <p style="font-size: 14px; color: #9ca3af; margin: 0;">- The ${appName} Team</p>
                </div>
              </div>
            </body>
          </html>
        `,
        text: `${data.title || "Notification"} - ${appName}\n\n${data.message || ""}\n\n${data.ctaUrl ? `View details: ${data.ctaUrl}` : ""}\n\n- The ${appName} Team`,
      };

    case "custom":
    default:
      return {
        html: data.html || "",
        text: data.text || "",
      };
  }
}

/**
 * Send an email using Resend
 */
export async function sendEmail(options: SendEmailOptions): Promise<{
  success: boolean;
  data?: { id: string };
  error?: string;
}> {
  if (!resend) {
    console.error("Resend API key not configured");
    return {
      success: false,
      error: "Email service not configured. Please add RESEND_API_KEY to your environment variables.",
    };
  }

  try {
    let html = options.html;
    let text = options.text;

    // Generate content from template if provided
    if (options.template && options.template !== "custom") {
      const content = generateTemplate(options.template, options.data);
      html = content.html;
      text = content.text;
    }

    // Resend requires html or text content
    if (!html && !text) {
      return {
        success: false,
        error: "Email must have either html or text content",
      };
    }

    const { data, error } = await resend.emails.send({
      from: options.from || DEFAULT_FROM,
      to: options.to,
      subject: options.subject,
      html: html || "",
      text: text,
      replyTo: options.replyTo,
    });

    if (error) {
      console.error("Error sending email:", error);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      data: { id: data?.id || "" },
    };
  } catch (error) {
    console.error("Error sending email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Send a batch of emails
 */
export async function sendBatchEmails(
  emails: SendEmailOptions[]
): Promise<{ success: boolean; results: Array<{ success: boolean; error?: string }> }> {
  const results = await Promise.all(emails.map((email) => sendEmail(email)));
  return {
    success: results.every((r) => r.success),
    results,
  };
}

/**
 * Check if email service is configured
 */
export function isEmailConfigured(): boolean {
  return !!resend;
}
