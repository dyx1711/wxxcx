const api = require('../../services/api')
const auth = require('../../utils/auth')

const app = getApp()

Page({
  data: {
    isLoggedIn: false,
    userInfo: null,
    logging: false
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.setData({
      isLoggedIn: app.globalData.isLoggedIn,
      userInfo: app.globalData.userInfo
    })
  },

  async handleLogin() {
    if (this.data.logging) return
    this.setData({ logging: true })
    wx.showLoading({ title: '登录中...' })
    try {
      const res = await api.login()
      wx.hideLoading()
      if (res.code === 0) {
        app.setUserInfo(res.data)
        this.setData({ isLoggedIn: true, userInfo: res.data })
        wx.showToast({ title: '登录成功', icon: 'success' })
      } else if (res.code === 403 && res.data && res.data.openid) {
        wx.showModal({
          title: '未加入白名单',
          content: `请把 OpenID 发给管理员：${res.data.openid}`,
          confirmText: '复制',
          success: modal => {
            if (modal.confirm) wx.setClipboardData({ data: res.data.openid })
          }
        })
      } else {
        wx.showToast({ title: res.message || '无权限，请联系管理员', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '登录失败，请重试', icon: 'none' })
    }
    this.setData({ logging: false })
  },

  requireLogin(action) {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return false
    }
    action()
    return true
  },

  goMyDevices() {
    this.requireLogin(() => {
      app.globalData.catalogMineOnly = true
      wx.switchTab({ url: '/pages/catalog/catalog' })
    })
  },

  goMyWorkorders() {
    this.requireLogin(() => {
      wx.navigateTo({ url: '/pages/my-workorders/my-workorders' })
    })
  },

  goMaintenanceRecords() {
    this.requireLogin(() => {
      wx.navigateTo({ url: '/pages/maintenance-records/maintenance-records' })
    })
  },

  goEnergyReport() {
    this.requireLogin(() => {
      wx.navigateTo({ url: '/pages/energy-report/energy-report' })
    })
  },

  goSettings() {
    this.requireLogin(() => {
      wx.navigateTo({ url: '/pages/settings/settings' })
    })
  },

  goAbout() {
    wx.navigateTo({ url: '/pages/about/about' })
  },

  handleLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          app.setUserInfo(null)
          auth.clearCache()
          this.setData({ isLoggedIn: false, userInfo: null })
          wx.showToast({ title: '已退出登录', icon: 'success' })
        }
      }
    })
  }
})
