import express from 'express';
import { subscribeNewsletter } from '../controllers/subscriberController.js';

const subscriberRouter = express.Router();

subscriberRouter.post('/subscribe', subscribeNewsletter);

export default subscriberRouter;
