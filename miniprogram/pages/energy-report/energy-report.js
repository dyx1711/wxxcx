const api = require('../../services/api')

const app = getApp()

function pad(n) {
  return String(n).padStart(2, '0')
}

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function weekKey(value) {
  const date = new Date(value)
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${pad(week)}`
}

function periodKey(periodType, date) {
  if (periodType === 'month') return date.slice(0, 7)
  if (periodType === 'week') return weekKey(date)
  return date
}

Page({
  data: {
    loading: true,
    canEdit: false,
    devices: [],
    deviceLabels: ['全部设备'],
    selectedDeviceIndex: 0,
    selectedDeviceId: '',
    periodTypes: ['day', 'week', 'month'],
    periodLabels: ['日', '周', '月'],
    chartPeriodIndex: 0,
    uploadPeriodIndex: 0,
    uploadDate: today(),
    uploadEnergy: '',
    uploadRemark: '',
    startDate: '',
    endDate: '',
    trend: [],
    records: [],
    cumulative: 0,
    report: null,
    calcResult: null,
    previewRows: []
  },

  onLoad() {
    const userInfo = app.globalData.userInfo
    this.setData({ canEdit: !!(userInfo && userInfo.role === 'admin') })
    this.init()
  },

  async init() {
    await this.loadDevices()
    await Promise.all([this.loadTrend(), this.loadReport()])
    this.setData({ loading: false })
  },

  async loadDevices() {
    try {
      const res = await api.getEnergyDevices()
      if (res.code === 0) {
        const devices = res.data.list || []
        this.setData({
          devices,
          deviceLabels: ['全部设备'].concat(devices.map(item => `${item.name}${item.location ? ' · ' + item.location : ''}`))
        })
      }
    } catch (e) {}
  },

  async loadTrend() {
    const periodType = this.data.periodTypes[this.data.chartPeriodIndex]
    const startKey = this.data.startDate ? periodKey(periodType, this.data.startDate) : ''
    const endKey = this.data.endDate ? periodKey(periodType, this.data.endDate) : ''
    try {
      const res = await api.getEnergyTrend({
        deviceId: this.data.selectedDeviceId,
        periodType,
        startKey,
        endKey
      })
      if (res.code === 0) {
        this.setData({
          trend: res.data.trend || [],
          records: res.data.list || [],
          cumulative: res.data.cumulative || 0
        })
        setTimeout(() => this.drawLineChart(), 50)
      }
    } catch (e) {
      wx.showToast({ title: '能耗趋势加载失败', icon: 'none' })
    }
  },

  async loadReport() {
    try {
      const res = await api.getEnergyReport()
      if (res.code === 0) {
        this.setData({ report: res.data })
      }
    } catch (e) {}
  },

  drawLineChart() {
    const query = wx.createSelectorQuery().in(this)
    query.select('#energyChart').fields({ node: true, size: true }).exec(res => {
      const item = res && res[0]
      if (!item || !item.node) return
      const canvas = item.node
      const ctx = canvas.getContext('2d')
      const dpr = wx.getSystemInfoSync().pixelRatio
      canvas.width = item.width * dpr
      canvas.height = item.height * dpr
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, item.width, item.height)

      const data = this.data.trend
      const padding = { left: 38, right: 14, top: 18, bottom: 34 }
      const width = item.width - padding.left - padding.right
      const height = item.height - padding.top - padding.bottom
      ctx.strokeStyle = '#E5E7EB'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(padding.left, padding.top)
      ctx.lineTo(padding.left, padding.top + height)
      ctx.lineTo(padding.left + width, padding.top + height)
      ctx.stroke()

      if (!data.length) {
        ctx.fillStyle = '#9CA3AF'
        ctx.font = '14px sans-serif'
        ctx.fillText('暂无能耗数据', item.width / 2 - 42, item.height / 2)
        return
      }

      const max = Math.max(...data.map(point => point.value), 1)
      const points = data.map((point, index) => {
        const x = padding.left + (data.length === 1 ? width / 2 : index / (data.length - 1) * width)
        const y = padding.top + height - point.value / max * height
        return { x, y, ...point }
      })

      ctx.strokeStyle = '#1E90FF'
      ctx.lineWidth = 2
      ctx.beginPath()
      points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y)
        else ctx.lineTo(point.x, point.y)
      })
      ctx.stroke()

      points.forEach(point => {
        ctx.fillStyle = '#1E90FF'
        ctx.beginPath()
        ctx.arc(point.x, point.y, 3, 0, Math.PI * 2)
        ctx.fill()
      })

      ctx.fillStyle = '#6B7280'
      ctx.font = '10px sans-serif'
      points.forEach((point, index) => {
        if (index % Math.ceil(points.length / 5) === 0 || index === points.length - 1) {
          ctx.fillText(point.label, Math.max(0, point.x - 16), item.height - 10)
        }
      })
    })
  },

  onDeviceChange(e) {
    const index = Number(e.detail.value)
    const device = this.data.devices[index - 1]
    this.setData({
      selectedDeviceIndex: index,
      selectedDeviceId: device ? device.id : ''
    })
    this.loadTrend()
  },

  onChartPeriodChange(e) {
    this.setData({ chartPeriodIndex: Number(e.detail.value) })
    this.loadTrend()
  },

  onUploadPeriodChange(e) {
    this.setData({ uploadPeriodIndex: Number(e.detail.value) })
  },

  onDateChange(e) {
    this.setData({ uploadDate: e.detail.value })
  },

  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value })
    this.loadTrend()
  },

  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value })
    this.loadTrend()
  },

  onEnergyInput(e) {
    this.setData({ uploadEnergy: e.detail.value })
  },

  onRemarkInput(e) {
    this.setData({ uploadRemark: e.detail.value })
  },

  async saveEnergy() {
    if (!this.data.canEdit) {
      wx.showToast({ title: '无上传权限', icon: 'none' })
      return
    }
    const device = this.data.devices[this.data.selectedDeviceIndex - 1]
    if (!device) {
      wx.showToast({ title: '请选择设备', icon: 'none' })
      return
    }
    const periodType = this.data.periodTypes[this.data.uploadPeriodIndex]
    wx.showLoading({ title: '保存中' })
    try {
      const res = await api.saveEnergyData({
        deviceId: device.id,
        deviceName: device.name,
        periodType,
        periodKey: periodKey(periodType, this.data.uploadDate),
        energy: this.data.uploadEnergy,
        remark: this.data.uploadRemark
      })
      wx.hideLoading()
      if (res.code === 0) {
        wx.showToast({ title: '已保存', icon: 'success' })
        this.setData({ uploadEnergy: '', uploadRemark: '' })
        this.loadTrend()
        this.loadReport()
      } else {
        wx.showToast({ title: res.message || '保存失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  async calculateEnergy() {
    const periodType = this.data.periodTypes[this.data.chartPeriodIndex]
    wx.showLoading({ title: '计算中' })
    try {
      const res = await api.calculateEnergy({
        deviceId: this.data.selectedDeviceId,
        periodType,
        startKey: this.data.startDate ? periodKey(periodType, this.data.startDate) : '',
        endKey: this.data.endDate ? periodKey(periodType, this.data.endDate) : ''
      })
      wx.hideLoading()
      if (res.code === 0) {
        this.setData({ calcResult: res.data })
      } else {
        wx.showToast({ title: res.message || '计算失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '计算失败', icon: 'none' })
    }
  },

  async previewReport() {
    const params = this.reportParams()
    wx.showLoading({ title: '生成预览' })
    try {
      const res = await api.createEnergyReport(params)
      wx.hideLoading()
      if (res.code === 0) {
        this.setData({ previewRows: res.data.rows || [], report: res.data })
      } else {
        wx.showToast({ title: res.message || '预览失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '预览失败', icon: 'none' })
    }
  },

  async handleDownload() {
    const params = this.reportParams()
    wx.showLoading({ title: '生成报告' })
    try {
      const res = await api.createEnergyReport(params)
      if (res.code !== 0) {
        wx.hideLoading()
        wx.showToast({ title: res.message || '生成失败', icon: 'none' })
        return
      }
      wx.cloud.downloadFile({
        fileID: res.data.fileID,
        success: fileRes => {
          wx.hideLoading()
          wx.openDocument({
            filePath: fileRes.tempFilePath,
            fileType: 'xls',
            showMenu: true
          })
        },
        fail: () => {
          wx.hideLoading()
          wx.showToast({ title: '下载失败', icon: 'none' })
        }
      })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '生成失败', icon: 'none' })
    }
  },

  reportParams() {
    const periodType = this.data.periodTypes[this.data.chartPeriodIndex]
    return {
      deviceId: this.data.selectedDeviceId,
      periodType,
      startKey: this.data.startDate ? periodKey(periodType, this.data.startDate) : '',
      endKey: this.data.endDate ? periodKey(periodType, this.data.endDate) : ''
    }
  }
})
