import mongoose from "mongoose";
import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import productModel from "../models/productModel.js";
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

const shortOrderId = (id) => String(id).slice(-6).toUpperCase()

const money = (value) => `Rs. ${(Number(value) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
})}`

const orderDate = (timestamp) => `${new Date(timestamp).toLocaleString('en-US', {
    timeZone: 'Asia/Karachi',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
})} PKT`

// Small Cloudinary thumbnails keep the mail light. f_auto is left out on
// purpose: some mail clients still cannot render the WebP it serves.
const thumbnail = (url) => {
    if (typeof url !== 'string' || !url.includes('/image/upload/')) return url
    return url.replace('/image/upload/', '/image/upload/q_auto,c_fill,w_128,h_128/')
}

const orderEmailHtml = ({
    statusLabel,
    heading,
    intro,
    orderId,
    date,
    items,
    subtotal,
    discount,
    couponCode,
    shipping,
    amount,
    address,
    ctaLabel,
    ctaUrl,
    footerNote,
}) => {
    const itemRows = (items || []).map((item) => {
        const image = thumbnail((item.image || [])[0])
        return `<tr>
            <td width="76" style="padding:14px 0;border-bottom:1px solid #eef1f4;vertical-align:top;">
                ${image ? `<img src="${escapeHtml(image)}" width="64" height="64" alt="" style="display:block;width:64px;height:64px;object-fit:cover;border-radius:10px;border:1px solid #e5e7eb;background:#f8fafc;" />` : ''}
            </td>
            <td style="padding:14px 12px;border-bottom:1px solid #eef1f4;vertical-align:top;">
                <div style="font-size:14px;font-weight:600;color:#111827;line-height:1.4;">${escapeHtml(item.name)}</div>
                <div style="font-size:13px;color:#6b7280;margin-top:4px;">${money(item.price)} &times; ${escapeHtml(item.quantity)}</div>
            </td>
            <td align="right" style="padding:14px 0;border-bottom:1px solid #eef1f4;vertical-align:top;font-size:14px;font-weight:600;color:#111827;white-space:nowrap;">
                ${money(Number(item.price) * Number(item.quantity))}
            </td>
        </tr>`
    }).join('')

    const summaryRow = (label, value, { negative = false, strong = false, border = false } = {}) => `
        <tr>
            <td style="padding:${border ? '16px 0 4px' : '6px 0'};${border ? 'border-top:1px solid #e5e7eb;' : ''}font-size:${strong ? '16px' : '14px'};font-weight:${strong ? 700 : 400};color:#374151;">${label}</td>
            <td align="right" style="padding:${border ? '16px 0 4px' : '6px 0'};${border ? 'border-top:1px solid #e5e7eb;' : ''}font-size:${strong ? '18px' : '14px'};font-weight:${strong ? 700 : 500};color:${negative ? '#15803d' : '#111827'};white-space:nowrap;">${value}</td>
        </tr>`

    const discountRow = Number(discount) > 0
        ? summaryRow(
            `Order discount${couponCode ? ` <span style="font-size:12px;color:#9ca3af;">(${escapeHtml(couponCode)})</span>` : ''}`,
            `-${money(discount)}`,
            { negative: true }
        )
        : ''

    const addressHtml = [
        `${address.firstName} ${address.lastName}`.trim(),
        address.street,
        [address.city, address.state, address.zipcode].filter(Boolean).join(', '),
        address.country,
        address.phone,
        address.email,
    ].filter(Boolean).map((line) => escapeHtml(line)).join('<br/>')

    const itemCount = (items || []).reduce((total, item) => total + (Number(item.quantity) || 0), 0)

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(heading)} #${escapeHtml(shortOrderId(orderId))} for ${money(amount)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef2f6;">
    <tr>
        <td align="center" style="padding:24px 12px;">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

                <tr>
                    <td style="background:#0b0b0c;padding:26px 32px;">
                        <div style="font-size:19px;font-weight:700;letter-spacing:8px;color:#ffffff;">DERMYX</div>
                        <div style="font-size:11px;letter-spacing:3px;color:#bfe3fd;margin-top:6px;">ADVANCED SKINCARE</div>
                    </td>
                </tr>

                <tr>
                    <td style="padding:30px 32px 0;">
                        <span style="display:inline-block;background:#eef7ff;border:1px solid #cfe8ff;border-radius:999px;color:#0b5cad;font-size:11px;font-weight:700;letter-spacing:1.5px;padding:6px 12px;">${statusLabel}</span>
                        <h1 style="margin:16px 0 8px;font-size:24px;line-height:1.25;color:#111827;font-weight:700;">${escapeHtml(heading)}</h1>
                        <p style="margin:0;font-size:13px;color:#6b7280;">
                            Order #${escapeHtml(shortOrderId(orderId))}
                            <span style="color:#d1d5db;"> &middot; </span>${escapeHtml(orderDate(date))}
                            <span style="color:#d1d5db;"> &middot; </span>${itemCount} ${itemCount === 1 ? 'item' : 'items'}
                        </p>
                        ${intro ? `<p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#4b5563;">${intro}</p>` : ''}
                        ${ctaUrl ? `<div style="margin-top:22px;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#0b0b0c;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:13px 24px;border-radius:10px;">${escapeHtml(ctaLabel)}</a></div>` : ''}
                    </td>
                </tr>

                <tr>
                    <td style="padding:30px 32px 0;">
                        <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#9ca3af;">ORDER SUMMARY</p>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${itemRows}</table>
                    </td>
                </tr>

                <tr>
                    <td style="padding:12px 32px 0;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            ${summaryRow('Subtotal', money(subtotal))}
                            ${discountRow}
                            ${summaryRow('Shipping <span style="font-size:12px;color:#9ca3af;">(Standard)</span>', Number(shipping) > 0 ? money(shipping) : 'Free')}
                            ${summaryRow('Total <span style="font-size:12px;font-weight:500;color:#6b7280;">PKR</span>', money(amount), { strong: true, border: true })}
                        </table>
                    </td>
                </tr>

                <tr>
                    <td style="padding:26px 32px 0;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;">
                            <tr>
                                <td style="padding:14px 16px;font-size:13px;color:#6b7280;">Payment</td>
                                <td align="right" style="padding:14px 16px;font-size:13px;font-weight:600;color:#111827;">
                                    Cash on Delivery (COD)<br/>
                                    <span style="font-weight:500;color:#6b7280;">${money(amount)} due on delivery</span>
                                </td>
                            </tr>
                            <tr>
                                <td colspan="2" style="padding:0 16px;font-size:0;line-height:0;">
                                    <div style="border-top:1px solid #e5e7eb;"></div>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:14px 16px;font-size:13px;color:#6b7280;">Shipping</td>
                                <td align="right" style="padding:14px 16px;font-size:13px;font-weight:600;color:#111827;">Standard</td>
                            </tr>
                        </table>
                    </td>
                </tr>

                <tr>
                    <td style="padding:26px 32px 0;">
                        <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#9ca3af;">DELIVERING TO</p>
                        <p style="margin:0;font-size:14px;line-height:1.7;color:#374151;">${addressHtml}</p>
                    </td>
                </tr>

                ${footerNote ? `<tr><td style="padding:22px 32px 0;"><p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">${footerNote}</p></td></tr>` : ''}

                <tr>
                    <td style="padding:28px 32px 30px;">
                        <div style="border-top:1px solid #e5e7eb;padding-top:18px;font-size:12px;line-height:1.7;color:#9ca3af;">
                            Questions about this order? Reply to this email or message us on WhatsApp at 0307-5111131.<br/>
                            Dermyx Skincare &middot; dermyxskincare.com
                        </div>
                    </td>
                </tr>

            </table>
        </td>
    </tr>
</table>
</body>
</html>`
}

const sendOwnerOrderNotification = async (order) => {
    try {
        await sendMail({
            to: process.env.OWNER_EMAIL,
            subject: safeSubject(`New order #${shortOrderId(order.orderId)} - ${money(order.amount)}`),
            html: orderEmailHtml({
                statusLabel: 'NEW ORDER',
                heading: 'New order created',
                intro: 'A customer just placed a Cash on Delivery order. The details are ready below.',
                orderId: order.orderId,
                date: order.date,
                items: order.items,
                subtotal: order.subtotal,
                discount: order.discount,
                couponCode: order.couponCode,
                shipping: order.shipping,
                amount: order.amount,
                address: order.address,
                ctaLabel: 'View order',
                ctaUrl: `${process.env.ADMIN_URL || 'https://dermyx-admin.vercel.app'}/orders`,
                footerNote: 'Payment is collected in cash when the parcel is delivered.',
            }),
        })
    } catch (err) {
        console.log("Order notification error:", err.message);
    }
};

// Customer-facing thank-you confirmation for the order they just placed
const sendOrderConfirmationEmail = async (order) => {
    try {
        const firstName = order.address?.firstName || 'there'
        const frontend = process.env.FRONTEND_URL || ''

        await sendMail({
            to: order.buyerEmail,
            subject: safeSubject(`Thank you for your order, ${firstName}! (#${shortOrderId(order.orderId)})`),
            html: orderEmailHtml({
                statusLabel: 'ORDER CONFIRMED',
                heading: 'Thank you for your order',
                intro: `Hi ${escapeHtml(firstName)}, we have received your order and our team is already packing it. Here is a copy of everything for your records.`,
                orderId: order.orderId,
                date: order.date,
                items: order.items,
                subtotal: order.subtotal,
                discount: order.discount,
                couponCode: order.couponCode,
                shipping: order.shipping,
                amount: order.amount,
                address: order.address,
                ctaLabel: order.showTracking ? 'Track your order' : 'Continue shopping',
                ctaUrl: order.showTracking ? `${frontend}/orders` : `${frontend}/`,
                footerNote: 'You can reply to this email with any question about your order.',
            }),
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

        const orderSummary = {
            orderId: newOrder._id,
            date: newOrder.date,
            items: orderItems,
            subtotal,
            discount,
            couponCode: coupon?.code,
            shipping,
            amount: orderAmount,
            address,
        }

        // Notify owner
        await sendOwnerOrderNotification(orderSummary)

        // Thank-you confirmation to the buyer (the delivery form email wins,
        // the account email is the fallback)
        await sendOrderConfirmationEmail({
            ...orderSummary,
            buyerEmail: address.email || savedUser?.email,
            showTracking: Boolean(userId),
        })

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