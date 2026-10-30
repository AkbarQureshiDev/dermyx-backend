import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'

const safeCompare = (candidate, expected) => {
    const a = Buffer.from(String(candidate ?? ''));
    const b = Buffer.from(String(expected ?? ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const adminAuth = async (req,res,next) => {
    try {
        const { token } = req.headers
        if (!token) {
            return res.json({success:false,message:"Not Authorized Login Again"})
        }
        const token_decode = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        // Older tokens carried the admin credentials in the payload; a payload is
        // only base64-encoded, so access is now claimed by an explicit role.
        const isAdminToken = token_decode && token_decode.role === 'admin'
            && safeCompare(token_decode.email, process.env.ADMIN_EMAIL);
        if (!isAdminToken) {
            return res.json({success:false,message:"Not Authorized Login Again"})
        }
        next()
    } catch (error) {
        console.log(error.message)
        res.json({ success: false, message: "Not Authorized Login Again" })
    }
}

export default adminAuth