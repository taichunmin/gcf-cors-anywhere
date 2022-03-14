require('dotenv').config()

const _ = require('lodash')
const axios = require('axios')
const createError = require('http-errors')
const net = require('net')
const functions = require('@google-cloud/functions-framework')

const getenv = (key, defaultval) => _.get(process, ['env', key], defaultval)

const NODE_ENV = getenv('NODE_ENV', 'production')

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

const middlewares = [
  // error handler
  async (ctx, next) => {
    try {
      return await next()
    } catch (err) {
      exports.log('ERROR', err)
      ctx.res.status(err.status || 500).send(err.message)
    }
  },

  // cors
  async (ctx, next) => {
    const origin = ctx.req.get('Origin') || '*'
    ctx.res.set('Access-Control-Allow-Origin', origin)
    ctx.res.set('Access-Control-Allow-Credentials', 'true')

    if (ctx.req.method !== 'OPTIONS') return await next()

    ctx.res.set('Access-Control-Allow-Headers', 'Authorization,Content-Type')
    ctx.res.set('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE')
    ctx.res.set('Access-Control-Max-Age', '3600')
    ctx.res.set('Vary', 'Origin')
    ctx.res.status(204).send('')
  },

  (() => { // valid url
    const cache = {}
    const isValidHostname = _.overSome([
      hostname => net.isIP(hostname) !== 0,
      hostname => {
        const parts = _.split(hostname, '.')
        return parts.length > 1 && _.includes(cache.tlds, _.toLower(_.last(parts)))
      },
    ])
    return async (ctx, next) => {
      const url = _.get(ctx, 'req.query.u')
      try {
        const tmp = new URL(url)
        if (!/^https?:$/.test(tmp.protocol)) throw new Error() // valid http/https

        // update tlds
        const nowms = Date.now()
        if (_.toSafeInteger(cache.expiredAt) < nowms) {
          const txt = _.get(await axios.get('https://data.iana.org/TLD/tlds-alpha-by-domain.txt'), 'data')
          cache.tlds = _.chain(txt)
            .split(/\r?\n/)
            .filter(row => _.isString(row) && row.length && !_.startsWith(row, '#'))
            .map(_.toLower)
            .value()
          cache.expiredAt = nowms + 864e5
        }

        if (!isValidHostname(tmp.hostname)) throw new Error() // valid hostname
      } catch (err) {
        throw createError(400, `invalid req.query.u: ${url}`)
      }
      return await next()
    }
  })(),

  // axios
  async (ctx, next) => {
    const axiosConfig = {
      data: ctx.req.rawBody,
      decompress: false,
      headers: _.omit({ ...ctx.req.headers, connection: 'close' }, OMIT_REQ_HEADERS),
      method: ctx.req.method,
      responseType: 'stream',
      transformResponse: [],
      url: ctx.req.query.u,
      validateStatus: () => true,
    }
    if (NODE_ENV !== 'production') {
      exports.log({
        axiosConfig,
        reqHeaders: ctx.req.headers,
        message: 'dump req.headers and axiosConfig',
      })
    }
    _.each(OMIT_RES_HEADERS, header => { ctx.res.removeHeader(header) })
    const axiosRes = await axios(axiosConfig)
    ctx.res.status(axiosRes.status).header(axiosRes.headers)
    if (NODE_ENV !== 'production') {
      exports.log({
        axiosResHeaders: axiosRes.headers,
        resHeaders: ctx.res._headers,
        message: 'dump res._headers and axiosRes.headers',
      })
    }
    axiosRes.data.pipe(ctx.res)
  },
]

exports.middlewareCompose = middleware => {
  // 型態檢查
  if (!_.isArray(middleware)) throw new TypeError('Middleware stack must be an array!')
  if (_.some(middleware, fn => !_.isFunction(fn))) throw new TypeError('Middleware must be composed of functions!')

  return async (context = {}, next) => {
    const cloned = [...middleware, ...(_.isFunction(next) ? [next] : [])]
    const executed = _.times(cloned.length + 1, () => 0)
    const dispatch = async cur => {
      if (executed[cur] !== 0) throw new Error(`middleware[${cur}] called multiple times`)
      if (cur >= cloned.length) {
        executed[cur] = 2
        return
      }
      try {
        executed[cur] = 1
        const result = await cloned[cur](context, () => dispatch(cur + 1))
        if (executed[cur + 1] === 1) throw new Error(`next() in middleware[${cur}] should be awaited`)
        executed[cur] = 2
        return result
      } catch (err) {
        executed[cur] = 3
        throw err
      }
    }
    return await dispatch(0)
  }
}

exports.errToPlainObj = (() => {
  const ERROR_KEYS = [
    'address',
    'code',
    'data',
    'dest',
    'errno',
    'info',
    'message',
    'name',
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
  return err => _.pick(err, ERROR_KEYS)
})()

exports.log = (() => {
  const LOG_SEVERITY = ['DEFAULT', 'DEBUG', 'INFO', 'NOTICE', 'WARNING', 'ERROR', 'CRITICAL', 'ALERT', 'EMERGENCY']
  return (...args) => {
    let severity = 'DEFAULT'
    if (args.length > 1 && _.includes(LOG_SEVERITY, _.toUpper(args[0]))) severity = _.toUpper(args.shift())
    _.each(args, arg => {
      if (_.isString(arg)) arg = { message: arg }
      if (arg instanceof Error) arg = exports.errToPlainObj(arg)
      console.log(JSON.stringify({ severity, ...arg }))
    })
  }
})()

const handler = exports.middlewareCompose(middlewares)
functions.http('main', (req, res) => handler({ req, res }))
