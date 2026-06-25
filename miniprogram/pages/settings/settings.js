const api = require('../../services/api')
const auth = require('../../utils/auth')

const app = getApp()

Page({
  data: {
    userInfo: null,
    canManage: false,
    loadingUsers: false,
    whitelist: [],
    roleOptions: ['viewer', 'editor', 'admin'],
    roleLabels: ['查看员', '编辑员', '管理员'],
    roleIndex: 0,
    form: {
      openid: '',
      name: '',
      company: '',
      department: '',
      role: 'viewer',
      status: 'active',
      permissions: {
        canView: true,
        canEdit: false,
        canManage: false
      }
    }
  },

  onShow() {
    const userInfo = app.globalData.userInfo
    const canManage = !!(userInfo && userInfo.role === 'admin')
    this.setData({ userInfo, canManage })
    if (canManage) this.loadUsers()
  },

  clearCache() {
    auth.clearCache()
    wx.showToast({ title: '缓存已清除', icon: 'success' })
  },

  changePassword() {
    wx.showToast({ title: '微信登录无需小程序密码', icon: 'none' })
  },

  async loadUsers() {
    this.setData({ loadingUsers: true })
    try {
      const res = await api.getPermissionUsers()
      if (res.code === 0) {
        this.setData({ whitelist: res.data.whitelist || [], loadingUsers: false })
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' })
        this.setData({ loadingUsers: false })
      }
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loadingUsers: false })
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onRoleChange(e) {
    const roleIndex = Number(e.detail.value)
    const role = this.data.roleOptions[roleIndex]
    this.setData({
      roleIndex,
      'form.role': role,
      'form.permissions.canView': true,
      'form.permissions.canEdit': role === 'editor' || role === 'admin',
      'form.permissions.canManage': role === 'admin'
    })
  },

  onPermissionChange(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.permissions.${field}`]: e.detail.value })
  },

  editWhitelist(e) {
    const { index } = e.currentTarget.dataset
    const item = this.data.whitelist[index]
    const roleIndex = Math.max(this.data.roleOptions.indexOf(item.role || 'viewer'), 0)
    this.setData({
      roleIndex,
      form: {
        openid: item.openid || '',
        name: item.name || '',
        company: item.company || '',
        department: item.department || '',
        role: item.role || 'viewer',
        status: item.status || 'active',
        permissions: item.permissions || { canView: true, canEdit: false, canManage: false }
      }
    })
  },

  resetForm() {
    this.setData({
      roleIndex: 0,
      form: {
        openid: '',
        name: '',
        company: '',
        department: '',
        role: 'viewer',
        status: 'active',
        permissions: { canView: true, canEdit: false, canManage: false }
      }
    })
  },

  async saveWhitelist() {
    if (!this.data.form.openid) {
      wx.showToast({ title: '请填写 OpenID', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中' })
    try {
      const res = await api.savePermissionUser(this.data.form)
      wx.hideLoading()
      if (res.code === 0) {
        wx.showToast({ title: '已保存', icon: 'success' })
        this.resetForm()
        this.loadUsers()
      } else {
        wx.showToast({ title: res.message || '保存失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  removeWhitelist(e) {
    const { openid } = e.currentTarget.dataset
    wx.showModal({
      title: '移出白名单',
      content: '移出后该用户将无法继续登录使用。',
      success: async res => {
        if (!res.confirm) return
        wx.showLoading({ title: '处理中' })
        try {
          const result = await api.removePermissionUser(openid)
          wx.hideLoading()
          if (result.code === 0) {
            wx.showToast({ title: '已移出', icon: 'success' })
            this.loadUsers()
          } else {
            wx.showToast({ title: result.message || '操作失败', icon: 'none' })
          }
        } catch (e) {
          wx.hideLoading()
          wx.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    })
  }
})
