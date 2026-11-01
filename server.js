import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import mongoSanitize from 'express-mongo-sanitize'
import cookieParser from 'cookie-parser'
import 'dotenv/config'
import connectDB from './config/mongodb.js'
import connectCloudinary from './config/cloudinary.js'
import userRouter from './routes/userRoute.js'
import productRouter from './routes/productRoute.js'
import cartRouter from './routes/cartRoute.js'
import orderRouter from './routes/orderRoute.js'
import reviewRouter from './routes/reviewRoute.js'
import subscriberRouter from './routes/subscriberRoute.js'
import contactRouter from './routes/contactRoute.js'
import couponRouter from './routes/couponRoute.js'
import { seedCoupons } from './controllers/couponController.js'

const app = express()
const port = process.env.PORT || 4000

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('JWT_SECRET is missing or too short (need at least 32 characters). Refusing to start.')
    process.exit(1)
}

// Behind a hosted load balancer the socket address is the proxy, so without this
// every shopper shares one rate-limit bucket (and express-rate-limit rejects the
// X-Forwarded-For header outright). Local dev talks to Express directly.
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1)
}

connectDB().then(seedCoupons)
connectCloudinary()

// --- Security Headers ---
app.use(helmet())

// --- CORS: allow frontend and admin panel ---
// The deployed origins are also listed directly: a FRONTEND_URL/ADMIN_URL that is
// missing, unset on Production, or carries a trailing slash silently 500s every
// browser request, which reads as a broken store rather than a config typo.
const normalizeOrigin = (value) => String(value || '').trim().replace(/\/+$/, '')
const allowedOrigins = [...new Set([
    process.env.FRONTEND_URL,
    process.env.ADMIN_URL,
    'https://dermyx-frontend.vercel.app',
    'https://dermyx-admin.vercel.app',
    'https://dermyxskincare.com',
    'https://www.dermyxskincare.com',
    'http://localhost:5173',
    'http://localhost:5174',
].map(normalizeOrigin).filter(Boolean))]

app.use(cors({
    origin: (origin, callback) => {
        // allow requests with no origin (e.g. curl, Postman) or matching origins
        if (!origin || allowedOrigins.includes(normalizeOrigin(origin))) {
            callback(null, true)
        } else {
            callback(new Error('Not allowed by CORS: ' + origin))
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'token', 'Authorization']
}))

// --- Body parsing & cookie parsing ---
app.use(express.json({ limit: '10kb' }))  // cap body size to prevent large payload attacks
app.use(cookieParser())

// --- NoSQL injection sanitization ---
app.use(mongoSanitize())

// --- Rate limiters ---
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 20,
    message: { success: false, message: 'Too many attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
})

const checkoutLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,  // 1 hour
    max: 30,
    message: { success: false, message: 'Too many checkout attempts, slow down.' },
    standardHeaders: true,
    legacyHeaders: false
})

const reviewLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,  // 1 hour
    max: 10,
    message: { success: false, message: 'Too many reviews posted, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
})

// Discount codes are checked from a public form, so guesses need a ceiling.
const couponLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,  // 1 hour
    max: 40,
    message: { success: false, message: 'Too many discount code attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
})

// The admin password is one shared credential, so guesses have to be expensive.
const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 5,
    message: { success: false, message: 'Too many admin login attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
})

// Contact and newsletter forms are unauthenticated mail-send vectors.
const publicFormLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,  // 1 hour
    max: 10,
    message: { success: false, message: 'Too many submissions, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
})

// Apply rate limits to sensitive routes
app.use('/api/user/login', authLimiter)
app.use('/api/user/register', authLimiter)
app.use('/api/user/forgot-password', authLimiter)
app.use('/api/user/reset-password', authLimiter)
app.use('/api/user/admin', adminLimiter)
app.use('/api/contact', publicFormLimiter)
app.use('/api/newsletter', publicFormLimiter)
app.use('/api/order/place', checkoutLimiter)
app.use('/api/order/stripe', checkoutLimiter)
app.use('/api/order/razorpay', checkoutLimiter)
app.use('/api/review/add', reviewLimiter)
app.use('/api/review/helpful', reviewLimiter)
app.use('/api/coupon/validate', couponLimiter)

// --- API routes ---
app.use('/api/user', userRouter)
app.use('/api/product', productRouter)
app.use('/api/cart', cartRouter)
app.use('/api/order', orderRouter)
app.use('/api/review', reviewRouter)
app.use('/api/newsletter', subscriberRouter)
app.use('/api/contact', contactRouter)
app.use('/api/coupon', couponRouter)

app.get('/', (req, res) => {
    res.send("API Working")
})

// --- Central error handler (no stack traces to client) ---
app.use((err, req, res, next) => {
    console.error(err) // log full error server-side only
    res.status(err.status || 500).json({
        success: false,
        message: process.env.NODE_ENV === 'production'
            ? 'Something went wrong'
            : err.message
    })
})

// Vercel's Node builder uses this export as the request handler; the listen call
// below is what `npm run server` binds to locally.
export default app

app.listen(port, () => console.log('Server started on PORT : ' + port))
