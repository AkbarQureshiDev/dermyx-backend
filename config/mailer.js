import nodemailer from "nodemailer"

// Public form fields end up inside an email you send from your own domain, so
// they must not be able to inject markup into it.
export const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

// CRLF in a subject would let a visitor append their own mail headers.
export const safeSubject = (value) => String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 120)

// Single SMTP entry point so order, delivery and review emails stay in one place.
const transporter = () => nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
})

export const sendMail = async ({ to, subject, html }) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log(`Email skipped (SMTP not configured): ${subject} -> ${to}`)
        return false
    }
    if (!to) {
        console.log(`Email skipped (no recipient): ${subject}`)
        return false
    }
    await transporter().sendMail({
        from: `"Dermyx Skincare" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html
    })
    return true
}

export const emailShell = (title, bodyHtml) => `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;">
    <h2 style="color:#1d4ed8;margin-top:0;">${title}</h2>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"/>
    <p style="color:#9ca3af;font-size:12px;">Dermyx Skincare &middot; dermyxskincare.com</p>
</div>`
