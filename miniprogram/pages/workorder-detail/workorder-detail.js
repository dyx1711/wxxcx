const api = require('../../services/api')

const app = getApp()

Page({
  data: {
    id: '',
    order: null,
    loading: true,
    uploading: false,
    canManage: false,
    users: [],
    userLabels: [],
    assigneeIndex: 0,
    traceContent: '',
    traceImages: []
  },

  onLoad(options) {
    const permissions = app.globalData.userInfo && app.globalData.userInfo.permissions
    this.setData({
      id: options.id || '',
      canManage: !!(permissions && permissions.canManage)
    })
    if (options.id) {
      this.loadOrder(options.id)
      if (this.data.canManage) this.loadUsers()
    }
  },

  async loadOrder(id) {
    this.setData({ loading: true })
    try {
      const res = await api.getWorkorderDetail(id)
      if (res.code === 0 && res.data) {
        this.setData({ order: res.data, loading: false })
      } else {
        wx.showToast({ title: res.message || '工单不存在', icon: 'none' })
        this.setData({ loading: false })
      }
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  async loadUsers() {
    try {
      const res = await api.getAssignableUsers()
      if (res.code === 0) {
        const users = res.data.list || []
        this.setData({
          users,
          userLabels: users.map(item => `${item.name}${item.department ? ' · ' + item.department : ''}`)
        })
      }
    } catch (e) {}
  },

  goDevice() {
    const { deviceId } = this.data.order
    if (deviceId) {
      api.getDeviceDetail(deviceId).catch(() => {})
      wx.navigateTo({ url: `/pages/device-detail/device-detail?id=${deviceId}` })
    }
  },

  async handleDispatch(e) {
    const index = Number(e.detail.value)
    const user = this.data.users[index]
    if (!user) return
    wx.showLoading({ title: '派工中' })
    try {
      const res = await api.dispatchWorkorder(this.data.order.id, user.openid)
      wx.hideLoading()
      if (res.code === 0) {
        wx.showToast({ title: '已派工', icon: 'success' })
        this.loadOrder(this.data.id)
      } else {
        wx.showToast({ title: res.message || '派工失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '派工失败', icon: 'none' })
    }
  },

  handleStart() {
    wx.showModal({
      title: '开始处理',
      content: '确认开始处理此工单？',
      success: async res => {
        if (!res.confirm) return
        wx.showLoading({ title: '处理中' })
        try {
          const result = await api.startWorkorder(this.data.order.id)
          wx.hideLoading()
          if (result.code === 0) {
            wx.showToast({ title: '已开始处理', icon: 'success' })
            this.loadOrder(this.data.id)
          } else {
            wx.showToast({ title: result.message || '操作失败', icon: 'none' })
          }
        } catch (e) {
          wx.hideLoading()
          wx.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    })
  },

  onTraceInput(e) {
    this.setData({ traceContent: e.detail.value })
  },

  chooseTraceImage() {
    if (this.data.uploading) return
    wx.chooseMedia({
      count: 6,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async res => {
        await this.uploadTraceImages(res.tempFiles || [])
      }
    })
  },

  async uploadTraceImages(files) {
    this.setData({ uploading: true })
    wx.showLoading({ title: '上传中' })
    try {
      const uploaded = []
      for (const file of files) {
        const filePath = file.tempFilePath || file.path
        const ext = (filePath || '').split('.').pop().toLowerCase() || 'jpg'
        const cloudPath = `workorders/traces/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`
        const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath })
        uploaded.push({
          name: cloudPath.split('/').pop(),
          fileID: uploadRes.fileID,
          size: file.size || 0,
          type: 'image'
        })
      }
      this.setData({ traceImages: this.data.traceImages.concat(uploaded) })
    } catch (e) {
      wx.showToast({ title: '图片上传失败', icon: 'none' })
    }
    wx.hideLoading()
    this.setData({ uploading: false })
  },

  removeTraceImage(e) {
    const index = Number(e.currentTarget.dataset.index)
    const images = this.data.traceImages.slice()
    images.splice(index, 1)
    this.setData({ traceImages: images })
  },

  previewImage(e) {
    const current = e.currentTarget.dataset.fileid
    const urls = e.currentTarget.dataset.group === 'trace'
      ? this.data.traceImages.map(item => item.url || item.fileID)
      : this.data.order.images.map(item => item.url || item.fileID)
    wx.previewImage({ current, urls })
  },

  previewTraceHistory(e) {
    const traceIndex = Number(e.currentTarget.dataset.traceIndex)
    const current = e.currentTarget.dataset.fileid
    const trace = this.data.order.traces[traceIndex]
    const urls = (trace.images || []).map(item => item.url || item.fileID)
    wx.previewImage({ current, urls })
  },

  async handleComplete() {
    if (!this.data.traceContent && !this.data.traceImages.length) {
      wx.showToast({ title: '请填写处理留痕或上传图片', icon: 'none' })
      return
    }
    wx.showLoading({ title: '提交中' })
    try {
      const res = await api.completeWorkorder(this.data.order.id, {
        content: this.data.traceContent,
        images: this.data.traceImages
      })
      wx.hideLoading()
      if (res.code === 0) {
        wx.showToast({ title: '已完成', icon: 'success' })
        this.setData({ traceContent: '', traceImages: [] })
        this.loadOrder(this.data.id)
      } else {
        wx.showToast({ title: res.message || '提交失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '提交失败', icon: 'none' })
    }
  }
})
