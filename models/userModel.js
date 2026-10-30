import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    cartData: { type: Object, default: {} },
    // Stores only the SHA-256 of the code, never the code itself.
    resetPasswordOtp: { type: String, default: '' },
    resetPasswordOtpExpires: { type: Date, default: null },
    resetPasswordOtpSentAt: { type: Date, default: null },
    resetPasswordOtpAttempts: { type: Number, default: 0 },
    resetPasswordSends: { type: Number, default: 0 },
    resetPasswordSendsWindowAt: { type: Date, default: null },
}, { minimize: false })

// Emails are looked up case-insensitively everywhere, so they must also be
// written that way. Otherwise "Foo@X.com" and "foo@X.com" become two accounts.
userSchema.pre('save', function lowercaseEmail(next) {
    if (this.isModified('email') && typeof this.email === 'string') {
        this.email = this.email.trim().toLowerCase()
    }
    next()
})

const userModel = mongoose.models.user || mongoose.model('user',userSchema);

export default userModel