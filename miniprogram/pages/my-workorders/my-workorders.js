const api = require('../../services/api')

const app = getApp()

Page({
  data: {
    status: 'pending',
    repairType: 'repair',
    statusTabs: [
      { key: 'pending', label: '待处理', count: 0 },
      { key: 'processing', label: '处理中', count: 0 },
      { key: 'completed', label: '已完成', count: 0 }
    ],
    typeTabs: [
      { key: 'repair', label: '维修' },
      { key: 'maintain', label: '保养' }
    ],
    orders: [],
    loading: true,
    canManage: false
  },

  onLoad(options = {}) {
    const userInfo = app.globalData.userInfo
    const canManage = !!(userInfo && userInfo.role === 'admin')
    this.setData({
      canManage,
      status: options.status || 'pending',
      repairType: options.repairType === 'maintain' ? 'maintain' : 'repair'
    })
    this.loadOrders()
  },

  onShow() {
    if (app.globalData.isLoggedIn) this.loadOrders()
  },

  switchStatus(e) {
    this.setData({ status: e.currentTarget.dataset.status })
    this.loadOrders()
  },

  switchType(e) {
    this.setData({ repairType: e.currentTarget.dataset.type })
    this.loadOrders()
  },

  async loadOrders() {
    this.setData({ loading: true })
    try {
      const res = await api.getWorkorders({
        status: this.data.status,
        repairType: this.data.repairType,
        mineOnly: !this.data.canManage
      })
      if (res.code === 0) {
        const counts = res.data.counts || {}
        this.setData({
          orders: res.data.list,
          statusTabs: this.data.statusTabs.map(tab => ({ ...tab, count: counts[tab.key] || 0 })),
          loading: false
        })
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' })
        this.setData({ loading: false })
      }
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset
    api.getWorkorderDetail(id).catch(() => {})
    wx.navigateTo({ url: `/pages/workorder-detail/workorder-detail?id=${id}` })
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/workorder-edit/workorder-edit' })
  },

  deleteOrder(e) {
    const { id } = e.currentTarget.dataset
    wx.showModal({
      title: '删除工单',
      content: '确认删除这条已完成工单记录吗？',
      confirmColor: '#EF4444',
      success: async res => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中' })
        try {
          const result = await api.deleteWorkorder(id)
          wx.hideLoading()
          if (result.code === 0) {
            wx.showToast({ title: '已删除', icon: 'success' })
            this.loadOrders()
          } else {
            wx.showToast({ title: result.message || '删除失败', icon: 'none' })
          }
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  },

  onPullDownRefresh() {
    this.loadOrders().finally(() => wx.stopPullDownRefresh())
  }
})
