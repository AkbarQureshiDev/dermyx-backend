import userModel from "../models/userModel.js"
import mongoose from "mongoose"

// Carts written before bundle pricing were derived from quantity stored the
// discounted unit price in the size key ("tier_864"). Fold those onto 'default'
// so a product is always a single line.
const normalizeCart = (cartData) => {
    const normalized = {}
    for (const [itemId, sizes] of Object.entries(cartData || {})) {
        const merged = {}
        for (const [size, qty] of Object.entries(sizes || {})) {
            const key = String(size).startsWith('tier_') || size === 'undefined' ? 'default' : size
            merged[key] = +(merged[key] || 0) + (Number(qty) || 0)
        }
        normalized[itemId] = merged
    }
    return normalized
}

const validItem = (itemId) => mongoose.Types.ObjectId.isValid(itemId)

// add products to user cart
const addToCart = async (req,res) => {
    try {
        
        const { userId, itemId, size = 'default', quantity } = req.body

        if (!validItem(itemId)) {
            return res.json({ success: false, message: "Invalid product" })
        }

        const userData = await userModel.findById(userId)
        if (!userData) {
            return res.json({ success: false, message: "Your session expired. Please log in again." })
        }
        let cartData = normalizeCart(userData.cartData);

        const line = { ...(cartData[itemId] || {}) }
        if (quantity !== undefined) {
            // Absolute quantity: a new bundle choice replaces the product's other lines
            const qty = Math.max(0, parseInt(quantity, 10) || 0)
            Object.keys(line).forEach(k => { if (k !== size) delete line[k] })
            line[size] = qty
        } else {
            line[size] = (line[size] || 0) + 1
        }
        cartData[itemId] = line

        await userModel.findByIdAndUpdate(userId, {cartData})

        res.json({ success: true, message: "Added To Cart", cartData })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// update user cart
const updateCart = async (req,res) => {
    try {
        
        const { userId ,itemId, size = 'default', quantity } = req.body

        if (!validItem(itemId)) {
            return res.json({ success: false, message: "Invalid product" })
        }

        const userData = await userModel.findById(userId)
        if (!userData) {
            return res.json({ success: false, message: "Your session expired. Please log in again." })
        }
        let cartData = normalizeCart(userData.cartData);

        const line = { ...(cartData[itemId] || {}) }
        const qty = Math.max(0, parseInt(quantity, 10) || 0)
        if (qty === 0) {
            delete line[size]
            if (Object.keys(line).length === 0) {
                delete cartData[itemId]
            } else {
                cartData[itemId] = line
            }
        } else {
            line[size] = qty
            cartData[itemId] = line
        }

        await userModel.findByIdAndUpdate(userId, {cartData})
        res.json({ success: true, message: "Cart Updated", cartData })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// merge a signed-out cart into the account cart on login
const mergeCart = async (req,res) => {
    try {

        const { userId, mergeData } = req.body

        const userData = await userModel.findById(userId)
        if (!userData) {
            return res.json({ success: false, message: "Your session expired. Please log in again." })
        }
        const savedCart = normalizeCart(userData.cartData)
        const guestCart = normalizeCart(mergeData)

        for (const [itemId, sizes] of Object.entries(guestCart)) {
            if (!validItem(itemId)) continue
            const line = { ...(savedCart[itemId] || {}) }
            for (const [size, qty] of Object.entries(sizes)) {
                // keep the higher choice: a guest bundle must not be downgraded
                // by an older single unit still sitting on the account cart
                line[size] = Math.max(line[size] || 0, Number(qty) || 0)
            }
            savedCart[itemId] = line
        }

        await userModel.findByIdAndUpdate(userId, { cartData: savedCart })

        res.json({ success: true, cartData: savedCart })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}


// get user cart data
const getUserCart = async (req,res) => {

    try {
        
        const { userId } = req.body
        
        const userData = await userModel.findById(userId)
        if (!userData) {
            return res.json({ success: false, message: "Your session expired. Please log in again." })
        }
        let cartData = normalizeCart(userData.cartData);

        res.json({ success: true, cartData })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }

}

export { addToCart, updateCart, getUserCart, mergeCart }
