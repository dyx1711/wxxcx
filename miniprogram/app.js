const auth = require('./utils/auth')

App({
  globalData: {
    userInfo: null,
    isLoggedIn: false,
    catalogMineOnly: false
  },

  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env: 'dyx0214-d4gg0btzz41aeafe8',
        traceUser: true
      })
    }
    const userInfo = auth.getUserInfo()
    if (userInfo) {
      this.globalData.userInfo = userInfo
      this.globalData.isLoggedIn = true
    }
  },

  setUserInfo(userInfo) {
    this.globalData.userInfo = userInfo
    this.globalData.isLoggedIn = !!userInfo
    if (userInfo) {
      auth.saveUserInfo(userInfo)
    } else {
      auth.clearUserInfo()
    }
  },

  checkLogin(showTip) {
    if (this.globalData.isLoggedIn) return true
    if (showTip) {
      wx.showToast({ title: '请先登录', icon: 'none' })
    }
    return false
  }
})
