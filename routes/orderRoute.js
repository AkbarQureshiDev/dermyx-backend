import express from 'express'
import {placeOrder, allOrders, userOrders, updateStatus, deleteOrder, deliveredOrders} from '../controllers/orderController.js'
import adminAuth  from '../middleware/adminAuth.js'
import authUser, { authOptional } from '../middleware/auth.js'

const orderRouter = express.Router()

// Admin Features
orderRouter.post('/list',adminAuth,allOrders)
orderRouter.post('/status',adminAuth,updateStatus)
orderRouter.post('/delete',adminAuth,deleteOrder)
orderRouter.post('/delivered-orders',adminAuth,deliveredOrders)

// Cash on Delivery checkout (guests allowed)
orderRouter.post('/place',authOptional,placeOrder)

// User Feature 
orderRouter.post('/userorders',authUser,userOrders)

export default orderRouter