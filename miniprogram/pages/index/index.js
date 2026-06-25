const api = require('../../services/api')
const { formatDate } = require('../../utils/format')

const app = getApp()

Page({
  data: {
    isLoggedIn: false,
    loading: true,
    dateStr: '',
    userInfo: null,
    stats: null,
    todos: [],
    maintenanceTypes: [],
    energyPeriod: 'week',
    energyData: null,
    statusOverview: null,
    mainDeviceAreas: []
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    this.setData({
      isLoggedIn: app.globalData.isLoggedIn,
      userInfo: app.globalData.userInfo,
      dateStr: formatDate(new Date())
    })
    if (app.globalData.isLoggedIn) {
      this.loadData()
    } else {
      this.setData({ loading: false })
    }
  },

  onPullDownRefresh() {
    if (!app.globalData.isLoggedIn) {
      wx.stopPullDownRefresh()
      return
    }
    this.loadData().finally(() => wx.stopPullDownRefresh())
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const res = await api.getHomeData()
      if (res.code === 0) {
        const { todos, energyDay, energyWeek, energyMonth, statusOverview, mainDeviceAreas, ...stats } = res.data
        this.setData({
          stats,
          todos,
          maintenanceTypes: res.data.maintenanceTypes || [],
          statusOverview,
          mainDeviceAreas: mainDeviceAreas || [],
          energyData: this.pickEnergyData(this.data.energyPeriod, { energyDay, energyWeek, energyMonth }),
          energyDay,
          energyWeek,
          energyMonth,
          loading: false
        })
        setTimeout(() => this.drawStatusPie(), 50)
      }
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  goLogin() {
    wx.switchTab({ url: '/pages/mine/mine' })
  },

  switchEnergy(e) {
    const period = e.currentTarget.dataset.period
    this.setData({
      energyPeriod: period,
      energyData: this.pickEnergyData(period, this.data)
    })
  },

  pickEnergyData(period, source) {
    const empty = { total: 0, unit: 'kWh', data: [] }
    if (period === 'day') return source.energyDay || empty
    if (period === 'month') return source.energyMonth || empty
    return source.energyWeek || empty
  },

  drawStatusPie() {
    const statusOverview = this.data.statusOverview
    if (!statusOverview || !statusOverview.pie) return
    const query = wx.createSelectorQuery().in(this)
    query.select('#statusPie').fields({ node: true, size: true }).exec(res => {
      const item = res && res[0]
      if (!item || !item.node) return
      const canvas = item.node
      const ctx = canvas.getContext('2d')
      const dpr = wx.getSystemInfoSync().pixelRatio
      canvas.width = item.width * dpr
      canvas.height = item.height * dpr
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, item.width, item.height)
      const cx = item.width / 2
      const cy = item.height / 2
      const radius = Math.min(item.width, item.height) / 2 - 4
      const total = Math.max(statusOverview.total || 0, 1)
      let start = -Math.PI / 2
      statusOverview.pie.forEach(part => {
        const angle = Math.PI * 2 * (part.count || 0) / total
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.arc(cx, cy, radius, start, start + angle)
        ctx.closePath()
        ctx.fillStyle = part.color
        ctx.fill()
        start += angle
      })
      ctx.beginPath()
      ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2)
      ctx.fillStyle = '#FFFFFF'
      ctx.fill()
      ctx.fillStyle = '#111827'
      ctx.font = 'bold 16px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(String(statusOverview.total || 0), cx, cy + 2)
      ctx.fillStyle = '#9CA3AF'
      ctx.font = '10px sans-serif'
      ctx.fillText('总计', cx, cy + 18)
    })
  },

  goCatalog() {
    if (!app.checkLogin(true)) return
    wx.switchTab({ url: '/pages/catalog/catalog' })
  },

  showMaintenanceTypes() {
    this.goPendingMaintain()
  },

  goWorkorders() {
    if (!app.checkLogin(true)) return
    wx.navigateTo({ url: '/pages/my-workorders/my-workorders' })
  },

  goPendingMaintain() {
    if (!app.checkLogin(true)) return
    wx.navigateTo({ url: '/pages/my-workorders/my-workorders?status=pending&repairType=maintain' })
  },

  goPendingRepair() {
    if (!app.checkLogin(true)) return
    wx.navigateTo({ url: '/pages/my-workorders/my-workorders?status=pending&repairType=repair' })
  },

  goMainDeviceDetail(e) {
    if (!app.checkLogin(true)) return
    const { id, name } = e.currentTarget.dataset
    if (!id) {
      wx.showToast({ title: `${name || '设备'}未录入`, icon: 'none' })
      return
    }
    api.getDeviceDetail(id).catch(() => {})
    wx.navigateTo({ url: `/pages/device-detail/device-detail?id=${id}` })
  },

  goWorkorderDetail(e) {
    if (!app.checkLogin(true)) return
    const { id } = e.currentTarget.dataset
    api.getWorkorderDetail(id).catch(() => {})
    wx.navigateTo({ url: `/pages/workorder-detail/workorder-detail?id=${id}` })
  },

  onReachBottom() {
    wx.showToast({ title: '加载更多历史记录', icon: 'none' })
  }
})
