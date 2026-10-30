import express from 'express'
import { addReview, productReviews, latestReviews, markHelpful, allReviews, removeReview } from '../controllers/reviewController.js'
import authUser from '../middleware/auth.js'
import adminAuth from '../middleware/adminAuth.js'

const reviewRouter = express.Router()

// Public
reviewRouter.post('/list', productReviews)
reviewRouter.post('/latest', latestReviews)

// Customers
reviewRouter.post('/add', authUser, addReview)
reviewRouter.post('/helpful', authUser, markHelpful)

// Admin
reviewRouter.post('/all', adminAuth, allReviews)
reviewRouter.post('/remove', adminAuth, removeReview)

export default reviewRouter
