const _ = require('lodash')
const axios = require('axios')
const cors = require('cors')
const createError = require('http-errors')
const net = require('net')
const router = require('express').Router()

const getenv = (key, defaultval) => _.get(process, ['env', key], defaultval)

const NODE_ENV = getenv('NODE_ENV', 'production')

const errToJson = (() => {
  const ERROR_KEYS = [
    'address',
    'code',
    'data',
    'dest',
    'errno',
    'info',
    'message',
    'name',
    'originalError.response.data',
    'path',
    'port',
    'reason',
    'response.data',
    'response.headers',
    'response.status',
    'stack',
    'status',
    'statusCode',
    'statusMessage',
    'syscall',
  ]
  return err => _.transform(ERROR_KEYS, (json, k) => {
    if (_.hasIn(err, k)) _.set(json, k, _.get(err, k))
  }, {})
})()

const OMIT_REQ_HEADERS = [
  'connection',
  'content-length',
  'forwarded',
  'function-execution-id',
  'host',
  'traceparent',
  'x-appengine-city',
  'x-appengine-citylatlong',
  'x-appengine-country',
  'x-appengine-default-version-hostname',
  'x-appengine-https',
  'x-appengine-region',
  'x-appengine-request-log-id',
  'x-appengine-timeout-ms',
  'x-appengine-user-ip',
  'x-client-data',
  'x-cloud-trace-context',
  'x-forwarded-for',
  'x-forwarded-proto',
]

const OMIT_RES_HEADERS = [
  'x-powered-by',
]

const validateUrl = (() => {
  const getTlds = async () => {
    let cache = null
    if (!cache) {
      const data = _.get(await axios.get('https://data.iana.org/TLD/tlds-alpha-by-domain.txt'), 'data')
      cache = _.filter(_.split(data, '\n'), row => row && !_.startsWith(row, '#'))
    }
    return cache
  }
  const isValidTld = async hostname => {
    const parts = _.split(hostname, '.')
    return parts.length > 1 && _.includes(await getTlds(), _.toUpper(_.last(parts)))
  }
  return async url => {
    const location = new URL(url)
    const hostname = location.hostname
    if (!net.isIPv4(hostname) && !net.isIPv6(hostname) && !await isValidTld(hostname)) throw createError(400, `invalid hostname: ${hostname}`)
    return location.href
  }
})()

router.all('*', cors(), async (req, res, next) => {
  try {
    const axiosConfig = {
      data: req.rawBody,
      decompress: false,
      headers: _.omit({ ...req.headers, connection: 'close' }, OMIT_REQ_HEADERS),
      method: req.method,
      responseType: 'stream',
      transformResponse: [],
      url: await validateUrl(req.query.u),
      validateStatus: () => true,
    }
    if (NODE_ENV !== 'production') {
      console.log('req.headers = ', JSON.stringify(req.headers))
      console.log('axiosConfig =', JSON.stringify(axiosConfig))
    }
    _.each(OMIT_RES_HEADERS, header => { res.removeHeader(header) })
    const axiosRes = await axios(axiosConfig)
    res.status(axiosRes.status).header(axiosRes.headers)
    if (NODE_ENV !== 'production') {
      console.log('axiosRes.headers = ', JSON.stringify(axiosRes.headers))
      console.log('res._headers = ', JSON.stringify(res._headers))
    }
    axiosRes.data.pipe(res)
  } catch (err) {
    console.log('error =', JSON.stringify(errToJson(err)))
    return next(err)
  }
})

exports.main = router
