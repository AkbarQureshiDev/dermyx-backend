import express from 'express'
import { listProducts, addProduct, removeProduct, singleProduct, updateProduct } from '../controllers/productController.js'
import upload from '../middleware/multer.js';
import adminAuth from '../middleware/adminAuth.js';

const productRouter = express.Router();

const imageFields = Array.from({ length: 8 }, (_, i) => ({ name: `image${i + 1}`, maxCount: 1 }));

productRouter.post('/add',adminAuth,upload.fields(imageFields),addProduct);
productRouter.post('/remove',adminAuth,removeProduct);
productRouter.post('/update',adminAuth,upload.fields(imageFields),updateProduct);
productRouter.post('/single',singleProduct);
productRouter.get('/list',listProducts)

export default productRouter