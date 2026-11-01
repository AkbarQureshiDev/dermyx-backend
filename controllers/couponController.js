import mongoose from 'mongoose'
import couponModel from '../models/couponModel.js'
import orderModel from '../models/orderModel.js'

// New coupons belong here (or in the database) — both are looked up on every
// order, so nothing is trusted from the browser.
const DEFAULT_COUPONS = [
    { code: 'Fati10', percent: 5 },
    { code: 'Ashar10', percent: 5 },
]

export const seedCoupons = async () => {
    try {
        if (mongoose.connection.readyState !== 1) return
        await Promise.all(DEFAULT_COUPONS.map(({ code, percent }) => couponModel.updateOne(
            { codeUpper: code.toUpperCase() },
            { $setOnInsert: { code, codeUpper: code.toUpperCase(), percent, active: true } },
            { upsert: true }
        )))
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
                    customers: { $addToSet: { $ifNull: ['$address.email', '$address.phone'] } },
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

export { validateCoupon, listCoupons }
