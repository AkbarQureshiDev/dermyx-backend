import nodemailer from "nodemailer";
import validator from "validator";
import { escapeHtml, safeSubject } from "../config/mailer.js";

const sendContactEmail = async (req, res) => {
    try {
        const name = String(req.body.name || '').trim().slice(0, 80);
        const email = String(req.body.email || '').trim().toLowerCase().slice(0, 120);
        const phone = String(req.body.phone || '').trim().slice(0, 40);
        const message = String(req.body.message || '').trim().slice(0, 3000);

        if (!name || !email || !message) {
            return res.json({ success: false, message: "Name, email and message are required." });
        }

        if (!validator.isEmail(email)) {
            return res.json({ success: false, message: "Please enter a valid email address." });
        }

        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            return res.json({ success: false, message: "Email service not configured." });
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.OWNER_EMAIL,
            subject: safeSubject(`📩 New Contact Form Message from ${name}`),
            html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
                <h2 style="color:#1d4ed8;margin-bottom:4px;">New Contact Message</h2>
                <p style="color:#6b7280;font-size:13px;margin-top:0;">Received via DermyxSkincare contact form</p>
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;"/>
                <table style="width:100%;font-size:14px;color:#374151;">
                    <tr><td style="padding:6px 0;font-weight:bold;width:100px;">Name:</td><td>${escapeHtml(name)}</td></tr>
                    <tr><td style="padding:6px 0;font-weight:bold;">Email:</td><td><a href="mailto:${encodeURIComponent(email)}" style="color:#1d4ed8;">${escapeHtml(email)}</a></td></tr>
                    <tr><td style="padding:6px 0;font-weight:bold;">Phone:</td><td>${escapeHtml(phone || 'Not provided')}</td></tr>
                </table>
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;"/>
                <h3 style="color:#374151;margin-bottom:8px;">Message:</h3>
                <div style="background:#f9fafb;border-left:4px solid #1d4ed8;padding:12px 16px;border-radius:6px;color:#374151;font-size:14px;line-height:1.6;">
                    ${escapeHtml(message).replace(/\n/g, '<br/>')}
                </div>
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"/>
                <p style="color:#9ca3af;font-size:12px;">DermyxSkincare – Automated Contact Notification</p>
            </div>`
        });

        res.json({ success: true, message: "Message sent successfully! We'll get back to you soon." });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export { sendContactEmail };
