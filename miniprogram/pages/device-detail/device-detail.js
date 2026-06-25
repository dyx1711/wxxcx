const api = require('../../services/api')
const app = getApp()

Page({
  data: {
    device: null,
    activeTab: 0,
    loading: true,
    canEdit: false,
    generatingQr: false,
    savingQr: false,
    qrVisible: false,
    qrInfo: null
  },

  onLoad(options) {
    const userInfo = app.globalData.userInfo
    this.setData({ canEdit: !!(userInfo && userInfo.role === 'admin') })
    const id = options.id || this.getIdFromScene(options.scene)
    if (id) {
      this.loadDevice(id)
    }
  },

  getIdFromScene(scene) {
    if (!scene) return ''
    const decoded = decodeURIComponent(scene)
    const params = decoded.split('&')
    for (const item of params) {
      const [key, value] = item.split('=')
      if (key === 'id') return value || ''
    }
    return ''
  },

  async loadDevice(id) {
    this.setData({ loading: true })
    try {
      const res = await api.getDeviceDetail(id)
      if (res.code === 0 && res.data) {
        this.setData({ device: res.data, loading: false })
        wx.setNavigationBarTitle({ title: '设备详情' })
      } else {
        wx.showToast({ title: '设备不存在', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  switchTab(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (index === 1) {
      wx.navigateTo({ url: `/pages/maintenance-records/maintenance-records?deviceId=${this.data.device.id}` })
      return
    }
    if (index === 2) {
      wx.navigateTo({ url: `/pages/energy-report/energy-report?deviceId=${this.data.device.id}` })
      return
    }
    this.setData({ activeTab: index })
  },

  editDevice() {
    if (!this.data.device) return
    wx.navigateTo({ url: `/pages/device-edit/device-edit?id=${this.data.device.id}` })
  },

  reportRepair() {
    if (!this.data.device) return
    wx.navigateTo({ url: `/pages/workorder-edit/workorder-edit?deviceId=${this.data.device.id}` })
  },

  openGuideFile(e) {
    const { fileid, url, type } = e.currentTarget.dataset
    if (!fileid) return
    if (url && url !== fileid) {
      wx.showLoading({ title: '文件加载中' })
      wx.downloadFile({
        url,
        success: res => {
          wx.hideLoading()
          wx.openDocument({
            filePath: res.tempFilePath,
            fileType: type || undefined,
            showMenu: true,
            fail: () => wx.showToast({ title: '文件无法打开', icon: 'none' })
          })
        },
        fail: () => {
          wx.hideLoading()
          wx.showToast({ title: '文件下载失败', icon: 'none' })
        }
      })
      return
    }
    wx.cloud.downloadFile({
      fileID: fileid,
      success: res => wx.openDocument({ filePath: res.tempFilePath, fileType: type || undefined, showMenu: true }),
      fail: () => wx.showToast({ title: '文件打开失败', icon: 'none' })
    })
  },

  async generateQrCode() {
    if (!this.data.device || this.data.generatingQr) return
    this.setData({ generatingQr: true })
    wx.showLoading({ title: '生成中' })
    try {
      const accountInfo = wx.getAccountInfoSync()
      const envVersion = (accountInfo && accountInfo.miniProgram && accountInfo.miniProgram.envVersion) || 'release'
      const res = await api.generateDeviceQrCode(this.data.device.id, envVersion)
      wx.hideLoading()
      if (res.code === 0) {
        this.setData({ qrInfo: res.data, qrVisible: true })
      } else {
        wx.showToast({ title: res.message || '生成失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e && e.errMsg ? e.errMsg.slice(0, 18) : '生成失败', icon: 'none' })
    }
    this.setData({ generatingQr: false })
  },

  closeQr() {
    this.setData({ qrVisible: false })
  },

  noop() {},

  saveQrImage() {
    const qrInfo = this.data.qrInfo
    if (!qrInfo || !qrInfo.fileID || this.data.savingQr) return
    this.setData({ savingQr: true })
    wx.showLoading({ title: '保存中' })
    wx.cloud.downloadFile({
      fileID: qrInfo.fileID,
      success: res => this.drawAndSaveQr(res.tempFilePath),
      fail: () => {
        wx.hideLoading()
        this.setData({ savingQr: false })
        wx.showToast({ title: '二维码下载失败', icon: 'none' })
      }
    })
  },

  drawAndSaveQr(qrPath) {
    const deviceName = (this.data.device && this.data.device.name) || '设备详情'
    wx.createSelectorQuery()
      .select('#qrCanvas')
      .fields({ node: true, size: true })
      .exec(res => {
        const canvas = res && res[0] && res[0].node
        if (!canvas) {
          wx.hideLoading()
          this.setData({ savingQr: false })
          wx.showToast({ title: '保存失败', icon: 'none' })
          return
        }

        const width = 320
        const height = 380
        const dpr = wx.getSystemInfoSync().pixelRatio || 1
        canvas.width = width * dpr
        canvas.height = height * dpr
        const ctx = canvas.getContext('2d')
        ctx.scale(dpr, dpr)
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, width, height)

        const image = canvas.createImage()
        image.onload = () => {
          ctx.drawImage(image, 40, 24, 240, 240)
          ctx.fillStyle = '#111827'
          ctx.font = 'bold 18px sans-serif'
          ctx.textAlign = 'center'
          this.drawQrName(ctx, deviceName, width / 2, 304, 260, 26)
          wx.canvasToTempFilePath({
            canvas,
            fileType: 'png',
            quality: 1,
            success: temp => {
              wx.saveImageToPhotosAlbum({
                filePath: temp.tempFilePath,
                success: () => {
                  wx.hideLoading()
                  this.setData({ savingQr: false })
                  wx.showToast({ title: '已保存', icon: 'success' })
                },
                fail: () => {
                  wx.hideLoading()
                  this.setData({ savingQr: false })
                  wx.showToast({ title: '保存失败，请开启相册权限', icon: 'none' })
                }
              })
            },
            fail: () => {
              wx.hideLoading()
              this.setData({ savingQr: false })
              wx.showToast({ title: '保存失败', icon: 'none' })
            }
          }, this)
        }
        image.onerror = () => {
          wx.hideLoading()
          this.setData({ savingQr: false })
          wx.showToast({ title: '二维码读取失败', icon: 'none' })
        }
        image.src = qrPath
      })
  },

  drawQrName(ctx, text, x, y, maxWidth, lineHeight) {
    let line = ''
    const lines = []
    for (let i = 0; i < text.length; i += 1) {
      const testLine = line + text[i]
      if (ctx.measureText(testLine).width > maxWidth && line) {
        lines.push(line)
        line = text[i]
      } else {
        line = testLine
      }
    }
    if (line) lines.push(line)
    lines.slice(0, 2).forEach((item, index) => {
      ctx.fillText(item, x, y + index * lineHeight)
    })
  }
})
