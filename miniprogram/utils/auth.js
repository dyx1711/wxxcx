const USER_KEY = 'device_user_info'
const CACHE_PREFIX = 'device_cache_'
const CACHE_TTL = 30 * 60 * 1000

function getUserInfo() {
  try {
    return wx.getStorageSync(USER_KEY) || null
  } catch (e) {
    return null
  }
}

function saveUserInfo(userInfo) {
  wx.setStorageSync(USER_KEY, userInfo)
}

function clearUserInfo() {
  wx.removeStorageSync(USER_KEY)
}

function setCache(key, data) {
  wx.setStorageSync(CACHE_PREFIX + key, {
    data,
    expireAt: Date.now() + CACHE_TTL
  })
}

function getCache(key) {
  try {
    const item = wx.getStorageSync(CACHE_PREFIX + key)
    if (!item) return null
    if (Date.now() > item.expireAt) {
      wx.removeStorageSync(CACHE_PREFIX + key)
      return null
    }
    return item.data
  } catch (e) {
    return null
  }
}

function clearCache() {
  try {
    const info = wx.getStorageInfoSync()
    info.keys.forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        wx.removeStorageSync(key)
      }
    })
  } catch (e) {}
}

module.exports = {
  getUserInfo,
  saveUserInfo,
  clearUserInfo,
  setCache,
  getCache,
  clearCache
}
