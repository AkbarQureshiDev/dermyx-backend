import mongoose from "mongoose";
import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import productModel from "../models/productModel.js";
import nodemailer from "nodemailer";
import { sendMail, emailShell, escapeHtml, safeSubject } from "../config/mailer.js";
import { findCoupon } from "./couponController.js";

const DELIVERY_FEE = 250
const FREE_SHIPPING_THRESHOLD = 3000

// Mirrors the bundle pricing shown in the storefront: the discount depends on
// how many units of one product are bought.
const bundleUnitPrice = (basePrice, quantity) => {
    const discount = quantity >= 3 ? 0.10 : quantity >= 2 ? 0.05 : 0
    return +(Number(basePrice) * (1 - discount)).toFixed(2)
}

const ADDRESS_LIMITS = {
    firstName: 80,
    lastName: 80,
    email: 120,
    street: 200,
    city: 80,
    state: 80,
    zipcode: 20,
    country: 60,
    phone: 40,
}

const REQUIRED_ADDRESS_FIELDS = ['firstName', 'lastName', 'street', 'city', 'country', 'phone']

// The delivery form is public input: keep only known fields, trimmed and capped,
// so nothing else from the request ends up in the order or the emails.
const cleanAddress = (address) => {
    const source = address && typeof address === 'object' ? address : {}
    const clean = {}
    for (const [field, max] of Object.entries(ADDRESS_LIMITS)) {
        clean[field] = String(source[field] ?? '').trim().slice(0, max)
    }
    return clean
}

const sendOwnerOrderNotification = async (address, items, amount) => {
    try {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });
        const itemList = items.map(i => `<li style="margin-bottom:4px;">${escapeHtml(i.name)} x${escapeHtml(i.quantity)} — Rs. ${escapeHtml(i.price)}</li>`).join('');
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.OWNER_EMAIL,
            subject: safeSubject(`🛒 New Order Received – Rs. ${amount}`),
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
                    ${escapeHtml(address.firstName)} ${escapeHtml(address.lastName)}<br/>
                    ${escapeHtml(address.street)}, ${escapeHtml(address.city)}<br/>
                    ${escapeHtml(address.state)}, ${escapeHtml(address.zipcode)}<br/>
                    ${escapeHtml(address.country)}<br/>
                    📞 ${escapeHtml(address.phone)}
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
                <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">${escapeHtml(i.name)}${Number(i.quantity) > 1 ? ` <span style="color:#2563eb;font-size:12px;">(Buy ${escapeHtml(i.quantity)} bundle)</span>` : ''}</td>
                <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;text-align:center;">${escapeHtml(i.quantity)}</td>
                <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;text-align:right;">Rs. ${(Number(i.price) * Number(i.quantity)).toFixed(2)}</td>
            </tr>`).join('');

        const firstName = address?.firstName || 'there';

        await sendMail({
            to: buyerEmail,
            subject: safeSubject(`Thank you for your order, ${firstName}! (#${String(orderId).slice(-6).toUpperCase()})`),
            html: emailShell(`Thank you for shopping with us, ${escapeHtml(firstName)}! 🌿`, `
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
                    ${escapeHtml(address?.firstName || '')} ${escapeHtml(address?.lastName || '')}<br/>
                    ${escapeHtml(address?.street || '')}, ${escapeHtml(address?.city || '')}<br/>
                    ${escapeHtml(address?.state || '')}, ${escapeHtml(address?.zipcode || '')}<br/>
                    ${escapeHtml(address?.country || '')}<br/>
                    ${escapeHtml(address?.phone || '')}
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
                <a href="${productName}/product/${encodeURIComponent(i._id)}" style="color:#1d4ed8;">${escapeHtml(i.name)}</a>
            </li>`).join('')

        await sendMail({
            to: order.address?.email,
            subject: "How did your Dermyx order work out?",
            html: emailShell(`Your order is delivered — now we'd love your honest review`, `
                <p style="color:#374151;font-size:15px;margin:0 0 16px;">
                    Hi ${escapeHtml(order.address?.firstName || 'there')}, your order #${String(order._id).slice(-6).toUpperCase()}
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
        
        const { userId, items, couponCode } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            return res.json({ success: false, message: 'Your cart is empty' })
        }

        const address = cleanAddress(req.body.address)
        const missing = REQUIRED_ADDRESS_FIELDS.filter(field => !address[field])
        if (missing.length > 0) {
            return res.json({ success: false, message: `Please fill in the delivery details: ${missing.join(', ')}` })
        }

        // Prices, bundle discounts and shipping are all derived here from the
        // database so nothing the browser sends can change what is charged.
        const productIds = [...new Set(items.map(item => String(item?._id ?? '')))]
            .filter(id => mongoose.Types.ObjectId.isValid(id));
        const liveProducts = await productModel.find({ _id: { $in: productIds } }).select('_id name price image inStock');
        const liveById = Object.fromEntries(liveProducts.map(p => [p._id.toString(), p]));

        const soldOut = []
        const orderItems = []
        let subtotal = 0

        for (const item of items) {
            const product = liveById[String(item?._id ?? '')]
            if (!product) {
                return res.json({ success: false, message: 'Some items in your cart are no longer available. Please refresh and try again.' })
            }
            if (product.inStock === false) {
                soldOut.push(product.name)
                continue
            }

            const quantity = Number(item.quantity)
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
                return res.json({ success: false, message: `Please choose a valid quantity for ${product.name}` })
            }

            const price = bundleUnitPrice(product.price, quantity)
            subtotal += price * quantity
            orderItems.push({
                _id: product._id.toString(),
                name: product.name,
                image: product.image || [],
                size: typeof item.size === 'string' ? item.size.slice(0, 24) : 'default',
                quantity,
                price,
            })
        }

        if (soldOut.length > 0) {
            return res.json({ success: false, message: `Out of stock: ${soldOut.join(', ')}` })
        }

        subtotal = +subtotal.toFixed(2)
        const coupon = await findCoupon(couponCode)
        const shipping = subtotal > FREE_SHIPPING_THRESHOLD ? 0 : DELIVERY_FEE
        const discount = coupon ? +(subtotal * coupon.percent / 100).toFixed(2) : 0
        const orderAmount = +(subtotal + shipping - discount).toFixed(2)

        const orderData = {
            userId,
            items: orderItems,
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
        await sendOwnerOrderNotification(address, orderItems, orderAmount)

        // Thank-you confirmation to the buyer (the delivery form email wins,
        // the account email is the fallback)
        const buyerEmail = address.email || savedUser?.email
        await sendOrderConfirmationEmail(buyerEmail, orderItems, orderAmount, address, newOrder._id, Boolean(userId))

        res.json({success:true,message:"Order Placed",orderId:newOrder._id})


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

export { placeOrder, allOrders, userOrders, updateStatus, deleteOrder, deliveredOrders }