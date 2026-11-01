import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: Array, required: true },
    category: { type: String, required: true },
    subCategory: { type: String, required: false, default: '' },
    sizes: { type: Array, required: false, default: [] },
    bestseller: { type: Boolean },
    date: { type: Number, required: true },
    // Display metadata for Best Seller cards
    tags: { type: Array, default: [] },          // e.g. ["Early Signs", "Anti Aging"]
    rating: { type: Number, default: 0 },         // e.g. 4.5
    reviewCount: { type: Number, default: 0 },    // e.g. 76
    originalPrice: { type: Number, default: 0 },  // crossed-out price for discounts
    badge: { type: String, default: '' },          // e.g. "SALE", "FREE", "NEW"
    features: { type: Array, default: [] },        // e.g. ["Dermatologically Tested", "All Skin Types"]
    ingredients: { type: String, default: '' },    // free text, shown as an expandable FAQ on the product page
    inStock: { type: Boolean, default: true }      // stock status
})

const productModel  = mongoose.models.product || mongoose.model("product",productSchema);

export default productModel