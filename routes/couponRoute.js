import express from 'express'
import { validateCoupon, listCoupons, addCoupon, removeCoupon } from '../controllers/couponController.js'
import adminAuth from '../middleware/adminAuth.js'

const couponRouter = express.Router()

couponRouter.post('/validate', validateCoupon)
couponRouter.post('/list', adminAuth, listCoupons)
couponRouter.post('/add', adminAuth, addCoupon)
couponRouter.post('/remove', adminAuth, removeCoupon)

export default couponRouter
