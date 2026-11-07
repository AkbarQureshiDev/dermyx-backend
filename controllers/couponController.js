import mongoose from 'mongoose'
import couponModel from '../models/couponModel.js'
import orderModel from '../models/orderModel.js'

// New coupons belong here (or in the database) — both are looked up on every
// order, so nothing is trusted from the browser.
const DEFAULT_COUPONS = [
    { code: 'Fati10', percent: 5 },
    { code: 'Ashar10', percent: 5 },
    { code: 'Mehak10', percent: 5 },
    { code: 'AN10', percent: 5 },
    { code: 'Rameen05', percent: 5 },
    { code: 'Muskan10', percent: 5 },
    { code: 'DrHim10', percent: 5 },
    { code: 'AMNASK10', percent: 5 },
    { code: 'Dermyx05', percent: 5 },
    { code: 'Nimra10', percent: 5 },
]

export const seedCoupons = async () => {
    try {
        if (mongoose.connection.readyState !== 1) return
        // Seeding only bootstraps an empty collection. Admins can now add and
        // remove codes, so re-inserting missing defaults on every boot would
        // resurrect codes they deleted on purpose.
        if (await couponModel.estimatedDocumentCount() > 0) return
        await couponModel.insertMany(DEFAULT_COUPONS.map(({ code, percent }) => ({
            code,
            codeUpper: code.toUpperCase(),
            percent,
            active: true,
        })))
    } catch (error) {
        console.log('Coupon seed error:', error.message)
    }
}

export const findCoupon = async (code) => {
    const normalized = String(code || '').trim().toUpperCase()
    if (!normalized) return null
    return couponModel.findOne({ codeUpper: normalized, active: true })
}

const validateCoupon = async (req, res) => {
    try {
        const coupon = await findCoupon(req.body.code)
        if (!coupon) {
            return res.json({ success: false, message: 'This discount code is not valid.' })
        }
        res.json({ success: true, code: coupon.code, percent: coupon.percent })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Every code with how often it was redeemed, for the admin panel.
const listCoupons = async (req, res) => {
    try {
        const coupons = await couponModel.find({}).lean()
        const usage = await orderModel.aggregate([
            { $match: { couponCode: { $nin: [null, ''] } } },
            {
                $group: {
                    _id: { $toUpper: '$couponCode' },
                    uses: { $sum: 1 },
                    // Guests often leave email blank (it's optional), so fall back
                    // to the phone number rather than counting them as unknown.
                    customers: {
                        $addToSet: {
                            $cond: [
                                { $gt: [{ $strLenCP: { $ifNull: ['$address.email', ''] } }, 0] },
                                '$address.email',
                                '$address.phone',
                            ],
                        },
                    },
                    totalDiscount: { $sum: { $ifNull: ['$discount', 0] } },
                    totalValue: { $sum: '$amount' },
                },
            },
        ])
        const usageByCode = Object.fromEntries(usage.map(entry => [entry._id, entry]))

        const rows = coupons.map((coupon) => {
            const entry = usageByCode[coupon.codeUpper] || {}
            return {
                code: coupon.code,
                percent: coupon.percent,
                active: coupon.active,
                uses: entry.uses || 0,
                customers: (entry.customers || []).filter(Boolean).length,
                totalDiscount: +(entry.totalDiscount || 0).toFixed(2),
                totalValue: +(entry.totalValue || 0).toFixed(2),
            }
        }).sort((a, b) => b.uses - a.uses || a.code.localeCompare(b.code))

        res.json({ success: true, coupons: rows })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

const normalizeCode = (value) => String(value || '').trim()
const CODE_PATTERN = /^[A-Za-z0-9_-]{3,24}$/

// Admin-created codes. Same casing rules as the seeded ones: `code` is what
// shoppers type back into the site, `codeUpper` is what lookups compare.
const addCoupon = async (req, res) => {
    try {
        const code = normalizeCode(req.body.code)
        const percent = Number(req.body.percent)

        if (!CODE_PATTERN.test(code)) {
            return res.json({ success: false, message: 'Use 3-24 letters, numbers, hyphens or underscores.' })
        }
        if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
            return res.json({ success: false, message: 'Discount must be a whole number between 1 and 100.' })
        }

        const existing = await couponModel.exists({ codeUpper: code.toUpperCase() })
        if (existing) {
            return res.json({ success: false, message: 'That discount code already exists.' })
        }

        await couponModel.create({ code, codeUpper: code.toUpperCase(), percent, active: true })
        res.json({ success: true, message: 'Discount code added.' })
    } catch (error) {
        // The unique index is the real guard; two admins can pass the check above together.
        if (error.code === 11000) {
            return res.json({ success: false, message: 'That discount code already exists.' })
        }
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Orders keep their own copy of the code and discount, so past redemption
// totals stay in the orders collection even after the code itself is gone.
const removeCoupon = async (req, res) => {
    try {
        const codeUpper = normalizeCode(req.body.code).toUpperCase()
        if (!codeUpper) {
            return res.json({ success: false, message: 'Discount code is required.' })
        }

        const deleted = await couponModel.findOneAndDelete({ codeUpper })
        if (!deleted) {
            return res.json({ success: false, message: 'That discount code no longer exists.' })
        }
        res.json({ success: true, message: 'Discount code removed.' })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export { validateCoupon, listCoupons, addCoupon, removeCoupon }
