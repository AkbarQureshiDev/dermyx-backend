import jwt from 'jsonwebtoken'

// Raw jsonwebtoken errors are useless to a shopper ("invalid signature").
// A stale token is normally issued under an old/changed secret, so the only
// recovery is a fresh login.
const SESSION_MESSAGES = {
    'jwt expired': 'Your session expired. Please log in again.',
    'invalid signature': 'Your login is no longer valid. Please log in again.',
    'jwt malformed': 'Your login is no longer valid. Please log in again.',
    'invalid token': 'Your login is no longer valid. Please log in again.',
    'jwt must be provided': 'Your login is no longer valid. Please log in again.',
}

const expiredSession = (res, message) => res.json({
    success: false,
    sessionExpired: true,
    message,
})

const authUser = async (req, res, next) => {

    const { token } = req.headers;

    if (!token) {
        return expiredSession(res, 'Not Authorized Login Again')
    }

    try {

        const token_decode = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
        // Admin tokens hold no shopper id; without this they would sail through
        // verification and reach the DB as an `undefined` userId.
        if (!token_decode.id) {
            return expiredSession(res, 'Not Authorized Login Again')
        }
        req.body.userId = token_decode.id
        next()

    } catch (error) {
        console.log(error.message)
        expiredSession(res, SESSION_MESSAGES[error.message] || 'Your login is no longer valid. Please log in again.')
    }

}

// Guest checkout: a signed-in shopper still gets their order linked to the
// account, but nothing about the request is required to place a COD order.
const authOptional = (req, res, next) => {

    const { token } = req.headers;

    // Never trust a client-supplied userId: only a verified token may link an
    // order to an account, otherwise a guest could target someone else's cart.
    if (req.body) delete req.body.userId

    if (!token) return next()

    try {
        const token_decode = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
        if (token_decode.id) req.body.userId = token_decode.id
    } catch {
        // A stale token must not block a guest from checking out.
    }

    next()
}

export { authOptional }
export default authUser
