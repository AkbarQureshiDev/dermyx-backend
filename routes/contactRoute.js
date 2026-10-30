import express from 'express';
import { sendContactEmail } from '../controllers/contactController.js';

const contactRouter = express.Router();

contactRouter.post('/send', sendContactEmail);

export default contactRouter;
