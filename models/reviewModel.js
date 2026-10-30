import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: "product", required: true, index: true },
    user: { type: String, ref: "user", default: '' },
    name: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, maxlength: 1000 },
    // Set when the reviewer has an order containing this product
    verified: { type: Boolean, default: false },
    helpful: { type: Number, default: 0 },
    helpfulBy: { type: [String], default: [] },
    createdAt: { type: Number, default: Date.now }
})

const reviewModel = mongoose.models.review || mongoose.model("review", reviewSchema);

export default reviewModel
