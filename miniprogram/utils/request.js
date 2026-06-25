const mock = require('./mock')

const BASE_URL = ''
const USE_MOCK = true
const TIMEOUT = 10000

function request(options) {
  const { url, method = 'GET', data = {} } = options

  if (USE_MOCK) {
    return mock.handleRequest(url, method, data)
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('网络请求超时'))
    }, TIMEOUT)

    wx.request({
      url: BASE_URL + url,
      method,
      data,
      header: {
        'content-type': 'application/json'
      },
      success(res) {
        clearTimeout(timer)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          reject(new Error(res.data?.message || '请求失败'))
        }
      },
      fail(err) {
        clearTimeout(timer)
        reject(err)
      }
    })
  })
}

module.exports = { request, USE_MOCK }
