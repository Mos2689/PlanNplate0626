// Email Send Edge Function
// Handles all email sending via Resend with templates

import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';

// Dynamic import for Resend
async function getResendClient() {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return null;
  const { Resend } = await import('https://esm.sh/resend@3.2.0');
  return new Resend(apiKey);
}

const DEFAULT_FROM = 'PlanNplate <welcome@plannplate.com.au>';

// PlanNplate brand colors
const PRIMARY_COLOR = '#6a7d56'; // Sage green
const SECONDARY_COLOR = '#5a6d46'; // Darker sage green
const ACCENT_COLOR = '#f97316'; // Orange

/**
 * Generate HTML content from template
 */
function generateTemplate(template, data = {}) {
  const appName = data.appName || 'PlanNplate';

  switch (template) {
    case 'welcome':
      return {
        html: `<!DOCTYPE html>
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
      <h1 style="color: ${PRIMARY_COLOR}; margin: 0 0 8px 0; font-size: 28px; font-weight: 700; text-align: center;">Welcome to ${appName}!</h1>
      <p style="color: #6b7280; margin: 0 0 24px 0; font-size: 15px; text-align: center;">Your journey to effortless meal planning starts here</p>
      <p style="font-size: 16px; margin-bottom: 20px; color: #1f2937;">Hi${data.name ? ` <strong>${data.name}</strong>` : ''},</p>
      <p style="font-size: 16px; margin-bottom: 24px; color: #4b5563;">Thanks for joining ${appName}! We're thrilled to have you on board. Get ready to simplify your meal planning, save time, and enjoy delicious, well-organized meals every day.</p>
      <div style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(249, 115, 22, 0.08) 100%); border-left: 4px solid ${PRIMARY_COLOR}; padding: 16px 20px; margin: 24px 0; border-radius: 0 8px 8px 0;">
        <p style="margin: 0; color: #166534; font-size: 15px; font-weight: 600;">What you can do with ${appName}:</p>
        <ul style="margin: 12px 0 0 0; padding-left: 20px; color: #166534;">
          <li style="margin-bottom: 6px; font-size: 15px;">Plan your meals for the week</li>
          <li style="margin-bottom: 6px; font-size: 15px;">Generate personalized recipes</li>
          <li style="margin-bottom: 6px; font-size: 15px;">Save recipes from the internet</li>
          <li style="margin-bottom: 6px; font-size: 15px;">Create smart shopping lists</li>
          <li style="font-size: 15px;">Track your nutrition goals</li>
        </ul>
      </div>
      ${data.ctaUrl ? `<div style="text-align: center; margin: 32px 0;"><a href="${data.ctaUrl}" style="background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${SECONDARY_COLOR} 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 12px; font-weight: 600; display: inline-block; font-size: 16px; box-shadow: 0 4px 14px rgba(34, 197, 94, 0.3);">Start Planning Your Meals</a></div>` : ''}
      <div style="border-top: 1px solid #e5e7eb; margin-top: 32px; padding-top: 24px;">
        <p style="font-size: 14px; color: #6b7280; margin: 0;">Have questions? Just reply to this email - we're always happy to help!</p>
        <p style="font-size: 14px; color: #6b7280; margin: 12px 0 0 0;">Happy cooking!</p>
        <p style="font-size: 14px; color: #9ca3af; margin: 8px 0 0 0;">- The ${appName} Team</p>
      </div>
    </div>
  </body>
</html>`,
        text: `Welcome to ${appName}!\n\nHi${data.name ? ` ${data.name}` : ''},\n\nThanks for joining ${appName}! We're thrilled to have you on board.\n\nGet ready to simplify your meal planning, save time, and enjoy delicious, well-organized meals every day.\n\nWhat you can do with ${appName}:\n- Plan your meals for the week\n- Generate personalized recipes\n- Save recipes from the internet\n- Create smart shopping lists\n- Track your nutrition goals\n\n${data.ctaUrl ? `Start planning: ${data.ctaUrl}\n\n` : ''}Have questions? Just reply to this email!\n\nHappy cooking!\n- The ${appName} Team`,
      };

    case 'password-reset':
      return {
        html: `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password - ${appName}</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
    <div style="background: linear-gradient(135deg, #374151 0%, #1f2937 100%); padding: 50px 20px; border-radius: 16px 16px 0 0; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Reset Your Password</h1>
    </div>
    <div style="background: white; padding: 40px 30px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <p style="font-size: 18px; margin-bottom: 20px; color: #1f2937;">Hi${data.name ? ` <strong>${data.name}</strong>` : ''},</p>
      <p style="font-size: 16px; margin-bottom: 24px; color: #4b5563;">We received a request to reset your ${appName} password. Click the button below to create a new password:</p>
      ${data.resetUrl ? `<div style="text-align: center; margin: 32px 0;"><a href="${data.resetUrl}" style="background: linear-gradient(135deg, #374151 0%, #1f2937 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 12px; font-weight: 600; display: inline-block; font-size: 16px;">Reset Password</a></div>` : ''}
      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px 20px; margin: 24px 0; border-radius: 0 8px 8px 0;">
        <p style="margin: 0; color: #92400e; font-size: 14px;">This link will expire in <strong>${data.expiry || '1 hour'}</strong>.</p>
      </div>
      <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">If you didn't request this password reset, you can safely ignore this email. Your password won't be changed.</p>
      <div style="border-top: 1px solid #e5e7eb; margin-top: 32px; padding-top: 24px;">
        <p style="font-size: 14px; color: #9ca3af; margin: 0;">- The ${appName} Team</p>
      </div>
    </div>
  </body>
</html>`,
        text: `Reset Your Password - ${appName}\n\nHi${data.name ? ` ${data.name}` : ''},\n\nWe received a request to reset your ${appName} password.\n\n${data.resetUrl ? `Reset your password: ${data.resetUrl}\n\n` : ''}This link will expire in ${data.expiry || '1 hour'}.\n\nIf you didn't request this, you can safely ignore this email.\n\n- The ${appName} Team`,
      };

    case 'verification':
      return {
        html: `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify Your Email - ${appName}</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
    <div style="background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${SECONDARY_COLOR} 100%); padding: 50px 20px; border-radius: 16px 16px 0 0; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Verify Your Email</h1>
    </div>
    <div style="background: white; padding: 40px 30px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <p style="font-size: 18px; margin-bottom: 20px; color: #1f2937;">Hi${data.name ? ` <strong>${data.name}</strong>` : ''},</p>
      <p style="font-size: 16px; margin-bottom: 24px; color: #4b5563;">Thanks for signing up for ${appName}! Please verify your email address to get started:</p>
      ${data.verifyUrl ? `<div style="text-align: center; margin: 32px 0;"><a href="${data.verifyUrl}" style="background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${SECONDARY_COLOR} 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 12px; font-weight: 600; display: inline-block; font-size: 16px; box-shadow: 0 4px 14px rgba(34, 197, 94, 0.4);">Verify Email Address</a></div>` : ''}
      ${data.code ? `<div style="text-align: center; margin: 32px 0;"><p style="font-size: 14px; color: #6b7280; margin-bottom: 16px;">Or enter this verification code:</p><div style="background: #f0fdf4; padding: 20px 32px; border-radius: 12px; display: inline-block; border: 2px dashed ${PRIMARY_COLOR};"><span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: ${SECONDARY_COLOR};">${data.code}</span></div></div>` : ''}
      <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">If you didn't create an account with ${appName}, you can safely ignore this email.</p>
      <div style="border-top: 1px solid #e5e7eb; margin-top: 32px; padding-top: 24px;">
        <p style="font-size: 14px; color: #9ca3af; margin: 0;">- The ${appName} Team</p>
      </div>
    </div>
  </body>
</html>`,
        text: `Verify Your Email - ${appName}\n\nHi${data.name ? ` ${data.name}` : ''},\n\nThanks for signing up for ${appName}! Please verify your email address.\n\n${data.verifyUrl ? `Verify here: ${data.verifyUrl}\n\n` : ''}${data.code ? `Or use this code: ${data.code}\n\n` : ''}If you didn't create an account, you can safely ignore this email.\n\n- The ${appName} Team`,
      };

    case 'notification':
      return {
        html: `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.title || 'Notification'} - ${appName}</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
    <div style="background: linear-gradient(135deg, ${ACCENT_COLOR} 0%, #ea580c 100%); padding: 50px 20px; border-radius: 16px 16px 0 0; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">${data.title || 'Notification'}</h1>
    </div>
    <div style="background: white; padding: 40px 30px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <p style="font-size: 16px; margin-bottom: 24px; color: #4b5563;">${data.message || ''}</p>
      ${data.ctaUrl ? `<div style="text-align: center; margin: 32px 0;"><a href="${data.ctaUrl}" style="background: linear-gradient(135deg, ${ACCENT_COLOR} 0%, #ea580c 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 12px; font-weight: 600; display: inline-block; font-size: 16px;">${data.ctaText || 'View Details'}</a></div>` : ''}
      <div style="border-top: 1px solid #e5e7eb; margin-top: 32px; padding-top: 24px;">
        <p style="font-size: 14px; color: #9ca3af; margin: 0;">- The ${appName} Team</p>
      </div>
    </div>
  </body>
</html>`,
        text: `${data.title || 'Notification'} - ${appName}\n\n${data.message || ''}\n\n${data.ctaUrl ? `View details: ${data.ctaUrl}` : ''}\n\n- The ${appName} Team`,
      };

    default:
      return {
        html: data.html || '',
        text: data.text || '',
      };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // GET /email-send/status - Check email configuration (no auth required)
  if (req.method === 'GET') {
    const apiKey = Deno.env.get('RESEND_API_KEY');
    return new Response(
      JSON.stringify({
        configured: !!apiKey,
        message: apiKey ? 'Email service is ready' : 'Email service not configured. Add RESEND_API_KEY to Edge Function secrets.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Verify authentication for POST requests
    const { user, error: authError } = await verifyAuth(req);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: authError || 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { to, subject, template, html, text, data } = body;

    // Validate required fields
    if (!to) {
      return new Response(
        JSON.stringify({ success: false, error: 'Recipient (to) is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!subject && !template) {
      return new Response(
        JSON.stringify({ success: false, error: 'Subject or template is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resend = await getResendClient();
    if (!resend) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let emailHtml = html;
    let emailText = text;
    let emailSubject = subject;

    // Generate content from template if provided
    if (template && template !== 'custom') {
      const content = generateTemplate(template, data || {});
      emailHtml = content.html;
      emailText = content.text;
      if (!subject) {
        // Generate default subjects based on template
        const appName = data?.appName || 'PlanNplate';
        switch (template) {
          case 'welcome':
            emailSubject = `Welcome to ${appName}!`;
            break;
          case 'password-reset':
            emailSubject = 'Reset Your Password';
            break;
          case 'verification':
            emailSubject = 'Verify Your Email';
            break;
          case 'notification':
            emailSubject = data?.title || 'Notification';
            break;
        }
      }
    }

    if (!emailHtml && !emailText) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email must have html or text content' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send email
    const { data: result, error } = await resend.emails.send({
      from: DEFAULT_FROM,
      to: Array.isArray(to) ? to : [to],
      subject: emailSubject,
      html: emailHtml || '',
      text: emailText,
    });

    if (error) {
      console.error('[Email] Send error:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: { id: result?.id || '' } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Email] Edge function error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});