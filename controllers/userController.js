import crypto from "node:crypto";
import validator from "validator";
import bcrypt from "bcrypt"
import jwt from 'jsonwebtoken'
import userModel from "../models/userModel.js";
import { sendMail, emailShell, escapeHtml } from "../config/mailer.js";


const OTP_TTL_MINUTES = 30;
const OTP_TTL_MS = OTP_TTL_MINUTES * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_SENDS_PER_HOUR = 5;
const OTP_MAX_ATTEMPTS = 5;

// Deliberately identical whether or not the address is registered.
const RESET_REQUESTED_MESSAGE = `If an account exists for that email, a 6-digit reset code is on its way. It expires in ${OTP_TTL_MINUTES} minutes.`;
const RESET_CODE_REJECTED_MESSAGE = "That code is invalid or has expired. Please request a new code.";

const normalizeEmail = (email) => (email || '').trim().toLowerCase();

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Accounts created before emails were lowercased can still be stored mixed-case,
// so reads must not depend on exact casing.
const findUserByEmail = (email) => userModel.findOne({
    email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' }
});

const hashOtp = (otp) => crypto.createHash('sha256').update(otp).digest('hex');

const createToken = (id, rememberMe = false) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: rememberMe ? '30d' : '1d'
    })
}

const passwordProblem = (password) => {
    if (!password || password.length < 8) return "Please choose a password of at least 8 characters.";
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "Password must contain at least one letter and one number.";
    return null;
}

const safeCompare = (candidate, expected) => {
    const a = Buffer.from(String(candidate ?? ''));
    const b = Buffer.from(String(expected ?? ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Route for user login
const loginUser = async (req, res) => {
    try {

        const { password, rememberMe } = req.body;
        const email = normalizeEmail(req.body.email);

        if (!email || !password) {
            return res.json({ success: false, message: "Please enter your email and password." })
        }

        const user = await findUserByEmail(email);

        if (!user) {
            return res.json({ success: false, message: "Invalid email or password." })
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {

            const token = createToken(user._id, rememberMe)
            res.json({ success: true, token })

        }
        else {
            res.json({ success: false, message: 'Invalid email or password.' })
        }

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }
}

// Route for user register
const registerUser = async (req, res) => {
    try {

        const { name, password } = req.body;
        const email = normalizeEmail(req.body.email);

        // validating email format & strong password
        if (!validator.isEmail(email)) {
            return res.json({ success: false, message: "Please enter a valid email" })
        }
        const weak = passwordProblem(password);
        if (weak) {
            return res.json({ success: false, message: weak })
        }

        // checking user already exists or not
        const exists = await findUserByEmail(email);
        if (exists) {
            return res.json({ success: false, message: "An account with this email already exists. Please log in." })
        }

        // hashing user password
        const salt = await bcrypt.genSalt(10)
        const hashedPassword = await bcrypt.hash(password, salt)

        const newUser = new userModel({
            name: (name || '').trim(),
            email,
            password: hashedPassword
        })

        let user
        try {
            user = await newUser.save()
        } catch (error) {
            // The unique index is the only guard against two submits of the same
            // email racing past the findOne above.
            if (error.code === 11000) {
                return res.json({ success: false, message: "An account with this email already exists. Please log in." })
            }
            throw error
        }

        const token = createToken(user._id)

        res.json({ success: true, token })

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }
}

// Route for admin login
const adminLogin = async (req, res) => {
    try {

        const { email, password } = req.body;
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!adminEmail || !adminPassword) {
            return res.status(503).json({ success: false, message: "Admin login is not configured." })
        }

        const credentialsOk = safeCompare(email, adminEmail) && safeCompare(password, adminPassword);

        if (credentialsOk) {
            // The token must not carry the credentials themselves; a JWT payload is
            // only base64-encoded, so anything signed here is readable by its holder.
            const token = jwt.sign({ email: adminEmail, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '12h' });
            res.json({ success: true, token })
        } else {
            res.json({ success: false, message: "Invalid credentials" })
        }

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }
}


// Route to request password reset code (OTP)
const forgotPassword = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);

        if (!validator.isEmail(email)) {
            return res.json({ success: false, message: "Please enter a valid email address." });
        }

        const user = await findUserByEmail(email);

        // Always answer the same way: a lookup that 404s would confirm which
        // addresses have accounts here.
        if (!user) {
            return res.json({ success: true, message: RESET_REQUESTED_MESSAGE });
        }

        const now = Date.now();
        const lastSentAt = user.resetPasswordOtpSentAt
            ? new Date(user.resetPasswordOtpSentAt).getTime()
            : 0;

        let sends = user.resetPasswordSends || 0;
        let windowStart = user.resetPasswordSendsWindowAt
            ? new Date(user.resetPasswordSendsWindowAt).getTime()
            : 0;
        if (now - windowStart > 60 * 60 * 1000) {
            sends = 0;
            windowStart = now;
        }

        // Throttle per address so the endpoint can't be used to flood one inbox.
        if (now - lastSentAt < OTP_RESEND_COOLDOWN_MS || sends >= OTP_MAX_SENDS_PER_HOUR) {
            return res.json({ success: true, message: RESET_REQUESTED_MESSAGE });
        }

        const otp = crypto.randomInt(100000, 1000000).toString();
        user.resetPasswordOtp = hashOtp(otp);
        user.resetPasswordOtpExpires = new Date(now + OTP_TTL_MS);
        user.resetPasswordOtpSentAt = new Date(now);
        user.resetPasswordOtpAttempts = 0;
        user.resetPasswordSends = sends + 1;
        user.resetPasswordSendsWindowAt = new Date(windowStart);
        await user.save();

        const emailHtml = emailShell(
            "Password Reset Code",
            `<p style="color:#374151;font-size:15px;line-height:1.6;">Hello ${escapeHtml(user.name || 'there')},</p>
             <p style="color:#374151;font-size:15px;line-height:1.6;">You requested a password reset for your account. Use the verification code below to set a new password:</p>
             <div style="background:#f3f4f6;padding:18px;text-align:center;border-radius:8px;margin:24px 0;">
                 <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#111827;display:inline-block;">${otp}</span>
             </div>
             <p style="color:#6b7280;font-size:13px;line-height:1.5;">This code will expire in <strong>${OTP_TTL_MINUTES} minutes</strong>. If you did not request this, you can safely ignore this email.</p>`
        );

        try {
            await sendMail({
                to: user.email,
                subject: "Your Password Reset Code - Dermyx",
                html: emailHtml
            });
        } catch (mailErr) {
            console.error("Failed to send reset email:", mailErr);
        }

        if (process.env.NODE_ENV !== 'production') {
            console.log(`[PASSWORD RESET] dev OTP for ${user.email}: ${otp}`);
        }

        res.json({ success: true, message: RESET_REQUESTED_MESSAGE });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// Route to verify OTP and reset password
const resetPassword = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const otp = (req.body.otp || '').trim();
        const { newPassword } = req.body;

        if (!validator.isEmail(email)) {
            return res.json({ success: false, message: "Please provide a valid email address." });
        }

        if (!/^\d{6}$/.test(otp)) {
            return res.json({ success: false, message: "Please provide the 6-digit verification code." });
        }

        const weak = passwordProblem(newPassword);
        if (weak) {
            return res.json({ success: false, message: weak });
        }

        const user = await findUserByEmail(email);
        const codeHash = hashOtp(otp);
        const hasLiveCode = Boolean(user && user.resetPasswordOtp);

        if (!hasLiveCode) {
            // Same reply as a wrong guess, so resetting cannot confirm accounts.
            return res.json({ success: false, message: RESET_CODE_REJECTED_MESSAGE });
        }

        if (Date.now() > new Date(user.resetPasswordOtpExpires).getTime()) {
            user.resetPasswordOtp = '';
            user.resetPasswordOtpExpires = null;
            await user.save();
            return res.json({ success: false, message: RESET_CODE_REJECTED_MESSAGE });
        }

        if (!safeCompare(codeHash, user.resetPasswordOtp)) {
            const attempts = (user.resetPasswordOtpAttempts || 0) + 1;
            if (attempts >= OTP_MAX_ATTEMPTS) {
                user.resetPasswordOtp = '';
                user.resetPasswordOtpExpires = null;
                user.resetPasswordOtpAttempts = 0;
            } else {
                user.resetPasswordOtpAttempts = attempts;
            }
            await user.save();
            return res.json({ success: false, message: RESET_CODE_REJECTED_MESSAGE });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        user.resetPasswordOtp = '';
        user.resetPasswordOtpExpires = null;
        user.resetPasswordOtpSentAt = null;
        user.resetPasswordOtpAttempts = 0;
        await user.save();

        res.json({ success: true, message: "Password reset successfully! Please log in with your new password." });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

export { loginUser, registerUser, adminLogin, forgotPassword, resetPassword }