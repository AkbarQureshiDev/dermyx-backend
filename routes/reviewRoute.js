import express from 'express'
import { addReview, productReviews, latestReviews, markHelpful, allReviews, removeReview } from '../controllers/reviewController.js'
import authUser, { authOptional } from '../middleware/auth.js'
import adminAuth from '../middleware/adminAuth.js'

const reviewRouter = express.Router()

// Public
reviewRouter.post('/list', productReviews)
reviewRouter.post('/latest', latestReviews)

// Customers and guests (a review only needs a name)
reviewRouter.post('/add', authOptional, addReview)
reviewRouter.post('/helpful', authUser, markHelpful)

// Admin
reviewRouter.post('/all', adminAuth, allReviews)
reviewRouter.post('/remove', adminAuth, removeReview)

export default reviewRouter
