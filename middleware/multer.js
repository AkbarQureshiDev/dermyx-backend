import multer from "multer";

const storage = multer.diskStorage({
    filename:function(req,file,callback){
        callback(null,file.originalname)
    }
})

const upload = multer({
    storage,
    // Product photos only; Cloudinary rejects the rest anyway, but not before
    // an arbitrary file has been written to the function's disk.
    limits: { fileSize: 8 * 1024 * 1024, files: 8 },
    fileFilter: (req, file, callback) => {
        if (!String(file.mimetype || '').startsWith('image/')) {
            const error = new Error('Only image files can be uploaded.')
            error.status = 400
            error.expose = true
            return callback(error)
        }
        callback(null, true)
    }
})

export default upload