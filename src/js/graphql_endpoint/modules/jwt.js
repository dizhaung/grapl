const jwt = require('jsonwebtoken');
const AWS = require('aws-sdk')

const IS_LOCAL = (process.env.IS_LOCAL === 'True') || null;
const UNSAFE_TLS = (process.env.UNSAFE_TLS == 'True') || null;
const JWT_SECRET_ID = process.env.JWT_SECRET_ID;
const secrets_manager_endpoint = process.env.SECRETS_MANAGER_ENDPOINT;

// UNSAFE_TLS is sometimes necessary when developing local grapl
// This should only ever be set when IS_LOCAL is also set
if (IS_LOCAL===true && UNSAFE_TLS===true) {
    console.warn("Disabling TLS on localgrapl for secretsmanager")
    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0
}
console.log(IS_LOCAL, secrets_manager_endpoint);
// Acts as a local cache of the secret so we don't have to refetch it every time
let JWT_SECRET = "";


const secretsmanager = new AWS.SecretsManager({
    apiVersion: '2017-10-17',
    region: IS_LOCAL ? 'us-east-1' : undefined,
    accessKeyId: IS_LOCAL ? 'dummy_cred_aws_access_key_id' : undefined,
    secretAccessKey: IS_LOCAL ? 'dummy_cred_aws_secret_access_key' : undefined,
    endpoint: IS_LOCAL ? 'http://secretsmanager.us-east-1.amazonaws.com:4584': undefined,
});

const fetchJwtSecret = async () => {
    // console.log("JWT_SECRET_ID: ", JWT_SECRET_ID);
    const getSecretRes = await secretsmanager.getSecretValue({
        SecretId: JWT_SECRET_ID,
    }).promise();
    return getSecretRes.SecretString;
}

// Prefetch the secret
(async () => {
    try {
        if (!JWT_SECRET) {
            JWT_SECRET = await fetchJwtSecret()
            .catch((e) => console.warn(e));
        }
    } catch (e) {
        console.error(e);
    }
})();

const verifyToken = async (jwtToken) => {
    if (!JWT_SECRET) {
        JWT_SECRET = await fetchJwtSecret();
    }
    try {
        return jwt.verify(jwtToken, JWT_SECRET, {
            algorithms: ['HS256']
        });
    } catch(e) {
        console.log('JWT failed with:',e);
        return null;
    }
};


module.exports.validateJwt = async (req, res, next) => {
    const headers = req.headers;
    let encoded_jwt = null

    if (!headers.cookie) {
        console.log("Missing cookie: ", headers)
        return res.sendStatus(401) // if there isn't any token
    }

    for (const _cookie of headers.cookie.split(';')) {
        const cookie = _cookie.trim();
        if (cookie.startsWith('grapl_jwt=')) {
            encoded_jwt = cookie.split('grapl_jwt=')[1].trim()
            break
        }
    }

    if (encoded_jwt == null) {
        console.warn('Missing jwt from cookie: ', headers)
        return res.sendStatus(401)
    }

    if (await verifyToken(encoded_jwt) !== null) {
        next() 
    } else {
        console.warn('Failed to verify token ', headers)
        return res.sendStatus(403)
    }
}
