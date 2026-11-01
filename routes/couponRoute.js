import express from 'express'
import { validateCoupon, listCoupons } from '../controllers/couponController.js'
import adminAuth from '../middleware/adminAuth.js'

const couponRouter = express.Router()

couponRouter.post('/validate', validateCoupon)
couponRouter.post('/list', adminAuth, listCoupons)

export default couponRouter
