import mongoose from "mongoose";

const connectDB = async () => {

    mongoose.connection.on('connected', () => {
        console.log("DB Connected");
    })

    mongoose.connection.on('error', (err) => {
        console.error("MongoDB connection error:", err.message);
    })

    mongoose.connection.on('disconnected', () => {
        console.warn("MongoDB disconnected, reconnecting...");
    })

    // Fail fast on DNS/replica selection and retry, instead of letting queries
    // sit in Mongoose's buffer until they time out at 10s.
    const options = {
        tls: true,
        tlsAllowInvalidCertificates: false,
        serverSelectionTimeoutMS: 5000,
    }

    let attempt = 0
    const connect = async () => {
        try {
            await mongoose.connect(process.env.MONGODB_URI, options)
            attempt = 0
        } catch (error) {
            attempt += 1
            const delay = Math.min(attempt * 2000, 10000)
            console.error(`MongoDB connect failed (attempt ${attempt}): ${error.message} — retrying in ${delay}ms`)
            if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {})
            setTimeout(connect, delay)
        }
    }

    await connect()

}

export default connectDB;
