import mongoose from 'mongoose'

const couponSchema = new mongoose.Schema({
    // `code` keeps the casing shoppers see, while lookups compare `codeUpper`.
    code: { type: String, required: true, unique: true },
    codeUpper: { type: String, required: true, unique: true, index: true },
    percent: { type: Number, required: true },
    active: { type: Boolean, required: true, default: true },
}, { timestamps: true })

const couponModel = mongoose.models.coupon || mongoose.model('coupon', couponSchema)
export default couponModel
