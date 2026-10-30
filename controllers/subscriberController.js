import subscriberModel from "../models/subscriberModel.js";
import nodemailer from "nodemailer";
import validator from "validator";
import { escapeHtml, safeSubject } from "../config/mailer.js";

const sendOwnerNotification = async (subject, html) => {
    try {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
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
            subject,
            html
        });
    } catch (err) {
        console.log("Owner notification error:", err.message);
    }
};

const subscribeNewsletter = async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase().slice(0, 120);

        if (!validator.isEmail(email)) {
            return res.json({ success: false, message: "Please enter a valid email address." });
        }

        // Addresses saved before lower-casing may be mixed-case, so don't match on
        // exact text or an existing subscriber gets counted as new.
        const exists = await subscriberModel.findOne({
            email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
        });
        if (exists) {
            return res.json({ success: false, message: "This email is already subscribed!" });
        }

        const newSubscriber = new subscriberModel({ email, date: Date.now() });
        await newSubscriber.save();

        // Notify owner
        await sendOwnerNotification(
            safeSubject(`🔔 New Newsletter Subscriber – ${email}`),
            `
            <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
                <h2 style="color:#1d4ed8;margin-bottom:8px;">New Subscriber Alert!</h2>
                <p style="color:#374151;font-size:15px;">Someone just subscribed to your newsletter on <strong>DermyxSkincare</strong>.</p>
                <div style="background:#f0f9ff;border-left:4px solid #1d4ed8;padding:12px 16px;border-radius:6px;margin:16px 0;">
                    <p style="margin:0;color:#1e40af;font-size:16px;font-weight:bold;">📧 ${escapeHtml(email)}</p>
                </div>
                <p style="color:#6b7280;font-size:13px;">You can view all subscribers in your admin dashboard.</p>
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"/>
                <p style="color:#9ca3af;font-size:12px;">DermyxSkincare – Automated Notification</p>
            </div>
            `
        );

        res.json({ success: true, message: `🎉 You're subscribed! Welcome to the DermyxSkincare family.` });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

export { subscribeNewsletter }
