import { v2 as cloudinary } from "cloudinary"
import productModel from "../models/productModel.js"
import subscriberModel from "../models/subscriberModel.js"
import nodemailer from "nodemailer"

// function for add product
const addProduct = async (req, res) => {
    try {

        const { name, description, price, category, subCategory, sizes, bestseller, tags, rating, reviewCount, originalPrice, badge, features } = req.body

        const images = Array.from({ length: 8 }, (_, i) => req.files?.[`image${i + 1}`]?.[0]).filter(Boolean)

        let imagesUrl = await Promise.all(
            images.map(async (item) => {
                let result = await cloudinary.uploader.upload(item.path, { resource_type: 'image' });
                return result.secure_url
            })
        )

        const productData = {
            name,
            description,
            category,
            price: Number(price),
            subCategory,
            bestseller: bestseller === "true" ? true : false,
            sizes: [],
            image: imagesUrl,
            date: Date.now(),
            tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
            rating: rating ? Number(rating) : 0,
            reviewCount: reviewCount ? Number(reviewCount) : 0,
            originalPrice: originalPrice ? Number(originalPrice) : 0,
            badge: badge || '',
            features: features ? features.split(',').map(f => f.trim()).filter(Boolean) : [],
            inStock: true
        }

        console.log(productData);

        const product = new productModel(productData);
        await product.save()

        // --- EMAIL NOTIFICATION LOGIC ---
        try {
            const subscribers = await subscriberModel.find({});
            const emails = subscribers.map(sub => sub.email);

            if (emails.length > 0 && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: process.env.EMAIL_USER,
                        pass: process.env.EMAIL_PASS
                    }
                });

                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    bcc: emails,
                    subject: `New Product Added: ${name}!`,
                    text: `Hey there!\n\nWe just added a new product to our store: ${name}.\n\nDescription: ${description}\nPrice: ${price}\n\nCheck it out on our store today!\n\nBest,\nThe Store Team`
                };

                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        console.log('Error sending notification emails:', error);
                    } else {
                        console.log('Notification emails sent:', info.response);
                    }
                });
            }
        } catch (emailError) {
            console.log("Failed to send emails: ", emailError);
        }
        // --------------------------------

        res.json({ success: true, message: "Product Added" })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for list product
const listProducts = async (req, res) => {
    try {
        
        const products = await productModel.find({}).sort({ date: -1 });
        res.json({success:true,products})

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for removing product
const removeProduct = async (req, res) => {
    try {
        
        await productModel.findByIdAndDelete(req.body.id)
        res.json({success:true,message:"Product Removed"})

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for single product info
const singleProduct = async (req, res) => {
    try {
        
        const { productId } = req.body
        const product = await productModel.findById(productId)
        res.json({success:true,product})

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for updating product
const updateProduct = async (req, res) => {
    try {
        const { id, price, originalPrice, inStock, features, category, existingImages } = req.body
        const updateData = {}
        if (price !== undefined) updateData.price = Number(price)
        if (originalPrice !== undefined) updateData.originalPrice = Number(originalPrice)
        if (inStock !== undefined) updateData.inStock = inStock === 'true' || inStock === true
        if (category !== undefined && category !== '') {
            updateData.category = category
            updateData.subCategory = category
        }
        if (features !== undefined) updateData.features = Array.isArray(features)
            ? features
            : features.split(',').map(f => f.trim()).filter(Boolean)

        if (req.files && Object.keys(req.files).length > 0) {
            let keptImages = []
            try {
                keptImages = existingImages ? JSON.parse(existingImages) : []
            } catch (parseError) {
                keptImages = []
            }

            const images = await Promise.all(
                Array.from({ length: 8 }, async (_, i) => {
                    const file = req.files[`image${i + 1}`] && req.files[`image${i + 1}`][0]
                    if (file) {
                        const result = await cloudinary.uploader.upload(file.path, { resource_type: 'image' })
                        return result.secure_url
                    }
                    return keptImages[i] || null
                })
            )

            const finalImages = images.filter(Boolean)
            if (finalImages.length > 0) updateData.image = finalImages
        }

        await productModel.findByIdAndUpdate(id, updateData)
        res.json({ success: true, message: 'Product Updated' })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export { listProducts, addProduct, removeProduct, singleProduct, updateProduct }