const api = require('../../services/api')
const auth = require('../../utils/auth')

const app = getApp()

function requestSubscribeMessage(tmplIds) {
  return new Promise((resolve, reject) => {
    wx.requestSubscribeMessage({
      tmplIds,
      success: resolve,
      fail: reject
    })
  })
}

const SUBSCRIBE_TYPES = {
  workorderAssigned: {
    name: '派工提醒',
    targetName: '派工'
  },
  maintenanceCreated: {
    name: '保养提醒',
    targetName: '保养'
  }
}

function defaultPreferences() {
  return {
    enabled: false,
    workorderAssigned: false,
    maintenanceCreated: false
  }
}

function buildSubscribeSummary(data = {}, type) {
  const meta = SUBSCRIBE_TYPES[type]
  if (!meta) return ''
  const templates = data.templates || {}
  const template = templates[type] || {}
  if (!data.configured || !template.configured) return `管理员需先配置${meta.name}模板`
  const preferences = data.preferences || {}
  return preferences[type] ? `可接收下一次${meta.targetName}提醒` : `授权后可接收下一次${meta.targetName}提醒`
}

function getTemplateId(templates = {}, type) {
  return templates[type] && templates[type].templateId || ''
}

function subscribeFailMessage(err = {}) {
  const msg = err.errMsg || err.message || ''
  if (msg.includes('can only be invoked by user TAP gesture')) return '请重新点击授权一次'
  if (msg.includes('cancel')) return '你已取消订阅授权'
  if (msg.includes('not in service')) return '订阅消息服务未开通'
  if (msg.includes('template')) return msg
  return msg ? `订阅授权失败：${msg}` : '订阅授权未完成'
}

Page({
  data: {
    isLoggedIn: false,
    userInfo: null,
    logging: false,
    subscribeLoading: false,
    subscribeLoadingType: '',
    subscribeConfigured: false,
    subscribeEnabled: false,
    subscribeTemplates: {},
    subscribePreferences: defaultPreferences(),
    subscribeStatusReady: false,
    workorderSubscribeSummary: '授权后可接收下一次派工提醒',
    maintenanceSubscribeSummary: '授权后可接收下一次保养提醒'
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.setData({
      isLoggedIn: app.globalData.isLoggedIn,
      userInfo: app.globalData.userInfo
    })
    if (app.globalData.isLoggedIn) this.loadSubscribeStatus()
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
        this.loadSubscribeStatus()
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

  async loadSubscribeStatus() {
    if (this.data.subscribeLoading) return
    try {
      const res = await api.getSubscribeMessageStatus()
      if (res.code === 0) {
        const preferences = res.data.preferences || {}
        this.setData({
          subscribeConfigured: !!res.data.configured,
          subscribeEnabled: !!preferences.enabled,
          subscribeTemplates: res.data.templates || {},
          subscribePreferences: {
            ...defaultPreferences(),
            ...preferences
          },
          subscribeStatusReady: true,
          workorderSubscribeSummary: buildSubscribeSummary(res.data, 'workorderAssigned'),
          maintenanceSubscribeSummary: buildSubscribeSummary(res.data, 'maintenanceCreated')
        })
      }
    } catch (e) {}
  },

  async handleSubscribeMessage(e) {
    this.requireLogin(async () => {
      if (this.data.subscribeLoading) return
      const type = e.currentTarget.dataset.type
      const meta = SUBSCRIBE_TYPES[type]
      if (!meta) return
      const tmplId = getTemplateId(this.data.subscribeTemplates, type)

      if (!this.data.subscribeStatusReady) {
        wx.showToast({ title: '提醒配置加载中，请稍后再点一次', icon: 'none' })
        this.loadSubscribeStatus()
        return
      }

      if (!tmplId) {
        wx.showModal({
          title: '提醒模板未配置',
          content: `请检查云数据库 app_config/subscribeMessage 中的${meta.name}模板 ID 是否已填写，并确认已重新部署 messageSubscribe 云函数。`,
          showCancel: false
        })
        return
      }

      this.setData({ subscribeLoading: true, subscribeLoadingType: type })
      try {
        console.log('requestSubscribeMessage tmplId', tmplId)
        const subscribeResult = await requestSubscribeMessage([tmplId])
        const saveRes = await api.saveSubscribeMessageStatus(subscribeResult, type)
        if (saveRes.code === 0) {
          const preferences = saveRes.data.preferences || {}
          this.setData({
            subscribeConfigured: !!saveRes.data.configured,
            subscribeEnabled: !!preferences.enabled,
            subscribeTemplates: saveRes.data.templates || {},
            subscribePreferences: {
              ...defaultPreferences(),
              ...preferences
            },
            subscribeStatusReady: true,
            workorderSubscribeSummary: buildSubscribeSummary(saveRes.data, 'workorderAssigned'),
            maintenanceSubscribeSummary: buildSubscribeSummary(saveRes.data, 'maintenanceCreated')
          })
          wx.showToast({ title: preferences[type] ? '已授权一次' : '未授权提醒', icon: 'none' })
        } else {
          wx.showToast({ title: saveRes.message || '保存提醒设置失败', icon: 'none' })
        }
      } catch (e) {
        const message = subscribeFailMessage(e)
        console.error('requestSubscribeMessage failed', e)
        wx.showModal({
          title: '订阅授权失败',
          content: message,
          showCancel: false
        })
      } finally {
        this.setData({ subscribeLoading: false, subscribeLoadingType: '' })
      }
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
          this.setData({
            isLoggedIn: false,
            userInfo: null,
            subscribeConfigured: false,
            subscribeEnabled: false,
            subscribeTemplates: {},
            subscribePreferences: defaultPreferences(),
            subscribeStatusReady: false,
            workorderSubscribeSummary: '授权后可接收下一次派工提醒',
            maintenanceSubscribeSummary: '授权后可接收下一次保养提醒'
          })
          wx.showToast({ title: '已退出登录', icon: 'success' })
        }
      }
    })
  }
})
