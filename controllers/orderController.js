import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import productModel from "../models/productModel.js";
import nodemailer from "nodemailer";
import { sendMail, emailShell } from "../config/mailer.js";
import { findCoupon } from "./couponController.js";

// global variables
const currency = 'inr'
const deliveryCharge = 10
const FREE_SHIPPING_THRESHOLD = 3000

const sendOwnerOrderNotification = async (address, items, amount) => {
    try {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });
        const itemList = items.map(i => `<li style="margin-bottom:4px;">${i.name} x${i.quantity} — Rs. ${i.price}</li>`).join('');
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.OWNER_EMAIL,
            subject: `🛒 New Order Received – Rs. ${amount}`,
            html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
                <h2 style="color:#1d4ed8;">New Order on DermyxSkincare!</h2>
                <div style="background:#f0f9ff;border-left:4px solid #1d4ed8;padding:12px 16px;border-radius:6px;margin:16px 0;">
                    <p style="margin:0;font-size:15px;color:#1e40af;font-weight:bold;">Total: Rs. ${amount}</p>
                </div>
                <h3 style="color:#374151;margin-bottom:8px;">📦 Items Ordered:</h3>
                <ul style="color:#374151;font-size:14px;padding-left:20px;">${itemList}</ul>
                <h3 style="color:#374151;margin-top:16px;margin-bottom:8px;">📍 Delivery Address:</h3>
                <p style="color:#374151;font-size:14px;line-height:1.6;">
                    ${address.firstName} ${address.lastName}<br/>
                    ${address.street}, ${address.city}<br/>
                    ${address.state}, ${address.zipcode}<br/>
                    ${address.country}<br/>
                    📞 ${address.phone}
                </p>
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"/>
                <p style="color:#9ca3af;font-size:12px;">DermyxSkincare – Automated Order Notification</p>
            </div>`
        });
    } catch (err) {
        console.log("Order notification error:", err.message);
    }
};

// Customer-facing thank-you confirmation for the order they just placed
const sendOrderConfirmationEmail = async (buyerEmail, items, amount, address, orderId, showTracking = true) => {
    try {
        const itemRows = (items || []).map(i => `
            <tr>
                <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">${i.name}${Number(i.quantity) > 1 ? ` <span style="color:#2563eb;font-size:12px;">(Buy ${i.quantity} bundle)</span>` : ''}</td>
                <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;text-align:center;">${i.quantity}</td>
                <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;text-align:right;">Rs. ${(Number(i.price) * Number(i.quantity)).toFixed(2)}</td>
            </tr>`).join('');

        const firstName = address?.firstName || 'there';

        await sendMail({
            to: buyerEmail,
            subject: `Thank you for your order, ${firstName}! (#${String(orderId).slice(-6).toUpperCase()})`,
            html: emailShell(`Thank you for shopping with us, ${firstName}! 🌿`, `
                <p style="color:#374151;font-size:15px;margin:0 0 16px;">
                    We've received your order and our team is already packing it. Here's a copy of your details.
                </p>
                <div style="background:#f0f9ff;border-left:4px solid #1d4ed8;padding:12px 16px;border-radius:6px;margin:16px 0;">
                    <p style="margin:0;font-size:13px;color:#1e40af;">Order ID</p>
                    <p style="margin:2px 0 0;font-size:16px;color:#1e3a8a;font-weight:bold;">#${String(orderId).slice(-6).toUpperCase()}</p>
                    <p style="margin:8px 0 0;font-size:15px;color:#1e40af;font-weight:bold;">Total payable: Rs. ${amount} (Cash on Delivery)</p>
                </div>
                <h3 style="color:#374151;margin:20px 0 8px;font-size:15px;">Your items</h3>
                <table style="width:100%;border-collapse:collapse;font-size:14px;color:#374151;">
                    <thead>
                        <tr style="text-align:left;color:#9ca3af;font-size:12px;">
                            <th style="padding-bottom:6px;">Product</th>
                            <th style="padding-bottom:6px;text-align:center;">Qty</th>
                            <th style="padding-bottom:6px;text-align:right;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>${itemRows}</tbody>
                </table>
                <h3 style="color:#374151;margin:20px 0 8px;font-size:15px;">Delivering to</h3>
                <p style="color:#374151;font-size:14px;line-height:1.6;margin:0;">
                    ${address?.firstName || ''} ${address?.lastName || ''}<br/>
                    ${address?.street || ''}, ${address?.city || ''}<br/>
                    ${address?.state || ''}, ${address?.zipcode || ''}<br/>
                    ${address?.country || ''}<br/>
                    ${address?.phone || ''}
                </p>
                <p style="color:#6b7280;font-size:13px;margin-top:20px;">
                    ${showTracking ? `You can track this order any time from <a href="${process.env.FRONTEND_URL || ''}/orders">My Orders</a>.` : ''}
                    Questions? Reply to this email or WhatsApp us on 0307-5111131.
                </p>`)
        })
    } catch (err) {
        console.log("Order confirmation email error:", err.message);
    }
};

// Review request sent once the admin marks an order as delivered
const sendReviewRequestEmail = async (order) => {
    try {
        const productName = process.env.FRONTEND_URL || ''
        const links = (order.items || []).map(i => `
            <li style="margin-bottom:6px;">
                <a href="${productName}/product/${i._id}" style="color:#1d4ed8;">${i.name}</a>
            </li>`).join('')

        await sendMail({
            to: order.address?.email,
            subject: "How did your Dermyx order work out?",
            html: emailShell(`Your order is delivered — now we'd love your honest review`, `
                <p style="color:#374151;font-size:15px;margin:0 0 16px;">
                    Hi ${order.address?.firstName || 'there'}, your order #${String(order._id).slice(-6).toUpperCase()}
                    has been marked as delivered. If it worked for your skin, a 30-second review helps
                    other customers decide — and it keeps us stocking the right things.
                </p>
                <ul style="color:#374151;font-size:14px;padding-left:20px;">${links}</ul>
                <p style="color:#6b7280;font-size:13px;">
                    Reviews are posted on each product page and read by our founders.
                </p>`)
        })
    } catch (err) {
        console.log("Review request email error:", err.message);
    }
};

// Placing orders using COD Method
const placeOrder = async (req,res) => {
    
    try {
        
        const { userId, items, amount, address, couponCode, subtotal, deliveryFee } = req.body;

        // A cart built before an admin marked an item out of stock must not
        // check out, so the live stock flags are read from the database.
        const productIds = [...new Set((items || []).map(item => item._id).filter(Boolean))];
        const liveProducts = await productModel.find({ _id: { $in: productIds } }).select('_id name inStock');
        const liveById = Object.fromEntries(liveProducts.map(p => [p._id.toString(), p]));

        const soldOut = (items || [])
            .map(item => liveById[item._id])
            .filter(product => !product || product.inStock === false)
            .map(product => product.name);

        if (soldOut.length > 0) {
            return res.json({ success: false, message: `Out of stock: ${soldOut.join(', ')}` })
        }

        // The browser sends the subtotal it displayed; the code and the free
        // shipping rule are applied here so neither can be edited in the request.
        const coupon = await findCoupon(couponCode)
        const baseSubtotal = Number(subtotal)
        const shipping = Number.isFinite(baseSubtotal) && baseSubtotal > FREE_SHIPPING_THRESHOLD
            ? 0
            : (Number(deliveryFee) || 0)
        let discount = 0
        let orderAmount = Number(amount) || 0
        if (Number.isFinite(baseSubtotal)) {
            if (coupon) discount = +(baseSubtotal * coupon.percent / 100).toFixed(2)
            orderAmount = +(baseSubtotal + shipping - discount).toFixed(2)
        }

        const orderData = {
            userId,
            items,
            address,
            amount: orderAmount,
            couponCode: coupon?.code,
            discount,
            paymentMethod:"COD",
            payment:false,
            date: Date.now()
        }

        const newOrder = new orderModel(orderData)
        await newOrder.save()

        // Guests have no account cart to clear.
        const savedUser = userId ? await userModel.findByIdAndUpdate(userId,{cartData:{}}) : null

        // Notify owner
        await sendOwnerOrderNotification(address, items, orderAmount)

        // Thank-you confirmation to the buyer (the delivery form email wins,
        // the account email is the fallback)
        const buyerEmail = address?.email || savedUser?.email
        await sendOrderConfirmationEmail(buyerEmail, items, orderAmount, address, newOrder._id, Boolean(userId))

        res.json({success:true,message:"Order Placed",orderId:newOrder._id})


    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }

}

// Placing orders using Stripe Method
const placeOrderStripe = async (req,res) => {
    try {
        
        const { userId, items, amount, address} = req.body
        const { origin } = req.headers;

        const orderData = {
            userId,
            items,
            address,
            amount,
            paymentMethod:"Stripe",
            payment:false,
            date: Date.now()
        }

        const newOrder = new orderModel(orderData)
        await newOrder.save()

        const line_items = items.map((item) => ({
            price_data: {
                currency:currency,
                product_data: {
                    name:item.name
                },
                unit_amount: item.price * 100
            },
            quantity: item.quantity
        }))

        line_items.push({
            price_data: {
                currency:currency,
                product_data: {
                    name:'Delivery Charges'
                },
                unit_amount: deliveryCharge * 100
            },
            quantity: 1
        })

        const session = await stripe.checkout.sessions.create({
            success_url: `${origin}/verify?success=true&orderId=${newOrder._id}`,
            cancel_url:  `${origin}/verify?success=false&orderId=${newOrder._id}`,
            line_items,
            mode: 'payment',
        })

        res.json({success:true,session_url:session.url});

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

// Verify Stripe 
const verifyStripe = async (req,res) => {

    const { orderId, success, userId } = req.body

    try {
        if (success === "true") {
            await orderModel.findByIdAndUpdate(orderId, {payment:true});
            await userModel.findByIdAndUpdate(userId, {cartData: {}})
            res.json({success: true});
        } else {
            await orderModel.findByIdAndDelete(orderId)
            res.json({success:false})
        }
        
    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }

}

// Placing orders using Razorpay Method
const placeOrderRazorpay = async (req,res) => {
    try {
        
        const { userId, items, amount, address} = req.body

        const orderData = {
            userId,
            items,
            address,
            amount,
            paymentMethod:"Razorpay",
            payment:false,
            date: Date.now()
        }

        const newOrder = new orderModel(orderData)
        await newOrder.save()

        const options = {
            amount: amount * 100,
            currency: currency.toUpperCase(),
            receipt : newOrder._id.toString()
        }

        await razorpayInstance.orders.create(options, (error,order)=>{
            if (error) {
                console.log(error)
                return res.json({success:false, message: error})
            }
            res.json({success:true,order})
        })

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

const verifyRazorpay = async (req,res) => {
    try {
        
        const { userId, razorpay_order_id  } = req.body

        const orderInfo = await razorpayInstance.orders.fetch(razorpay_order_id)
        if (orderInfo.status === 'paid') {
            await orderModel.findByIdAndUpdate(orderInfo.receipt,{payment:true});
            await userModel.findByIdAndUpdate(userId,{cartData:{}})
            res.json({ success: true, message: "Payment Successful" })
        } else {
             res.json({ success: false, message: 'Payment Failed' });
        }

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}


// All Orders data for Admin Panel
const allOrders = async (req,res) => {

    try {
        
        const orders = await orderModel.find({})
        res.json({success:true,orders})

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }

}

// User Order Data For Forntend
const userOrders = async (req,res) => {
    try {
        
        const { userId } = req.body

        const orders = await orderModel.find({ userId })
        res.json({success:true,orders})

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

// update order status from Admin Panel
const updateStatus = async (req,res) => {
    try {
        
        const { orderId, status } = req.body

        // Read the old status before writing: the review email must fire only on
        // the transition into Delivered, not every time the admin re-saves it.
        const before = await orderModel.findById(orderId).select('status address items')
        if (!before) {
            return res.json({ success: false, message: 'Order not found' })
        }

        await orderModel.findByIdAndUpdate(orderId, { status })

        if (status === 'Delivered' && before.status !== 'Delivered') {
            await sendReviewRequestEmail({ ...before.toObject(), _id: orderId, status })
        }

        res.json({success:true,message:'Status Updated'})

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

// Delete order from Admin Panel
const deleteOrder = async (req, res) => {
    try {
        const { orderId } = req.body
        await orderModel.findByIdAndDelete(orderId)
        res.json({ success: true, message: 'Order Deleted' })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Get all Delivered orders
const deliveredOrders = async (req, res) => {
    try {
        const orders = await orderModel.find({ status: 'Delivered' }).sort({ date: -1 })
        res.json({ success: true, orders })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export {verifyRazorpay, verifyStripe ,placeOrder, placeOrderStripe, placeOrderRazorpay, allOrders, userOrders, updateStatus, deleteOrder, deliveredOrders}