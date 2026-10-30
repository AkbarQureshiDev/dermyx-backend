import mongoose from "mongoose"
import reviewModel from "../models/reviewModel.js"
import productModel from "../models/productModel.js"
import orderModel from "../models/orderModel.js"

const validId = (id) => mongoose.Types.ObjectId.isValid(id)

// product.rating / product.reviewCount used to be typed by hand in the admin
// Add form; they are now derived from the real review rows.
const syncProductRating = async (productId) => {
    const [agg] = await reviewModel.aggregate([
        { $match: { product: new mongoose.Types.ObjectId(productId) } },
        { $group: { _id: null, count: { $sum: 1 }, avg: { $avg: "$rating" } } }
    ])
    await productModel.findByIdAndUpdate(productId, {
        rating: agg ? +agg.avg.toFixed(1) : 0,
        reviewCount: agg ? agg.count : 0
    })
}

const hasPurchased = async (userId, productId) => {
    if (!userId) return false
    const order = await orderModel.findOne({
        userId,
        "items._id": { $in: [String(productId), productId] }
    })
    return !!order
}

// function for creating or updating the reviewer's own review
const addReview = async (req, res) => {
    try {
        const { userId } = req.body
        const { productId, rating, comment } = req.body

        if (!validId(productId)) {
            return res.json({ success: false, message: "Invalid product" })
        }
        const score = Number(rating)
        if (!Number.isInteger(score) || score < 1 || score > 5) {
            return res.json({ success: false, message: "Rating must be between 1 and 5" })
        }
        const text = String(comment || "").trim()
        if (text.length < 4) {
            return res.json({ success: false, message: "Please write a few words about the product" })
        }
        if (text.length > 1000) {
            return res.json({ success: false, message: "Review is too long (1000 characters max)" })
        }

        const product = await productModel.findById(productId)
        if (!product) {
            return res.json({ success: false, message: "Product not found" })
        }

        const existing = await reviewModel.findOne({ product: productId, user: userId })
        const verified = await hasPurchased(userId, productId)

        let saved
        if (existing) {
            existing.rating = score
            existing.comment = text
            existing.verified = verified
            await existing.save()
            saved = existing
        } else {
            saved = await reviewModel.create({
                product: productId,
                user: userId,
                name: String(req.body.name || "").trim().slice(0, 60) || "Customer",
                rating: score,
                comment: text,
                verified
            })
        }

        await syncProductRating(productId)

        res.json({ success: true, message: existing ? "Review updated" : "Review published", review: saved })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for listing one product's reviews with a rating summary
const productReviews = async (req, res) => {
    try {
        const { productId, sort = "recent" } = req.body

        if (!validId(productId)) {
            return res.json({ success: false, message: "Invalid product" })
        }

        const sortMap = {
            recent: { createdAt: -1 },
            highest: { rating: -1, createdAt: -1 },
            lowest: { rating: 1, createdAt: -1 },
            helpful: { helpful: -1, createdAt: -1 }
        }

        const reviews = await reviewModel.find({ product: productId }).sort(sortMap[sort] || sortMap.recent).lean()

        const breakdown = [5, 4, 3, 2, 1].map((star) => ({
            star,
            count: reviews.filter((r) => Number(r.rating) === star).length
        }))
        const total = reviews.length
        const average = total ? +(reviews.reduce((sum, r) => sum + Number(r.rating), 0) / total).toFixed(1) : 0

        res.json({
            success: true,
            reviews: reviews.map(({ helpfulBy, ...rest }) => rest),
            summary: { average, total, breakdown }
        })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for the latest reviews across the store (home page carousel)
const latestReviews = async (req, res) => {
    try {
        const limit = Math.min(Number(req.body.limit) || 8, 24)
        const reviews = await reviewModel.find({ rating: { $gte: 4 } })
            .sort({ helpful: -1, createdAt: -1 })
            .limit(limit)
            .populate("product", "name")
            .lean()

        res.json({
            success: true,
            reviews: reviews.map(({ helpfulBy, product, ...rest }) => ({
                ...rest,
                productName: product?.name || ""
            }))
        })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for toggling a helpful vote
const markHelpful = async (req, res) => {
    try {
        const { userId, reviewId } = req.body

        const review = await reviewModel.findById(reviewId)
        if (!review) {
            return res.json({ success: false, message: "Review not found" })
        }

        const voted = review.helpfulBy.includes(userId)
        if (voted) {
            review.helpfulBy = review.helpfulBy.filter((id) => id !== userId)
            review.helpful = Math.max(0, review.helpful - 1)
        } else {
            review.helpfulBy.push(userId)
            review.helpful += 1
        }
        await review.save()

        res.json({ success: true, helpful: review.helpful, voted: !voted })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for the admin reviews panel
const allReviews = async (req, res) => {
    try {
        const { productId, minRating } = req.body

        const filter = {}
        if (productId && validId(productId)) filter.product = productId
        if (minRating) filter.rating = { $gte: Number(minRating) }

        const reviews = await reviewModel.find(filter)
            .sort({ createdAt: -1 })
            .populate("product", "name image")
            .lean()

        const stats = {
            total: reviews.length,
            average: reviews.length
                ? +(reviews.reduce((sum, r) => sum + Number(r.rating), 0) / reviews.length).toFixed(1)
                : 0,
            fiveStar: reviews.filter((r) => r.rating === 5).length,
            verified: reviews.filter((r) => r.verified).length
        }

        res.json({
            success: true,
            reviews: reviews.map(({ helpfulBy, product, ...rest }) => ({
                ...rest,
                productName: product?.name || "Deleted product",
                productImage: product?.image?.[0] || ""
            })),
            stats
        })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for removing a review (admin moderation)
const removeReview = async (req, res) => {
    try {
        const { id } = req.body

        const review = await reviewModel.findByIdAndDelete(id)
        if (!review) {
            return res.json({ success: false, message: "Review not found" })
        }

        await syncProductRating(review.product)

        res.json({ success: true, message: "Review removed" })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export { addReview, productReviews, latestReviews, markHelpful, allReviews, removeReview }
