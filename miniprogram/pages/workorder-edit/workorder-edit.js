const api = require('../../services/api')

const app = getApp()

Page({
  data: {
    loading: false,
    saving: false,
    uploading: false,
    priorityOptions: ['normal', 'high', 'urgent', 'low'],
    priorityLabels: ['普通', '高', '紧急', '低'],
    priorityIndex: 0,
    repairTypeOptions: ['repair', 'maintain'],
    repairTypeLabels: ['维修', '保养'],
    repairTypeIndex: 0,
    form: {
      deviceId: '',
      deviceName: '',
      deviceType: '',
      location: '',
      repairType: 'repair',
      title: '',
      faultType: '',
      description: '',
      priority: 'normal',
      deadline: '',
      images: []
    }
  },

  onLoad(options = {}) {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(() => wx.switchTab({ url: '/pages/mine/mine' }), 800)
      return
    }
    if (options.deviceId) {
      this.setData({ 'form.deviceId': options.deviceId })
      this.loadDevice(options.deviceId)
    }
  },

  async loadDevice(id) {
    this.setData({ loading: true })
    try {
      const res = await api.getDeviceDetail(id)
      if (res.code === 0 && res.data) {
        this.setData({
          'form.deviceName': res.data.name,
          'form.deviceType': res.data.type || res.data.typeLabel || '',
          'form.location': res.data.location,
          'form.title': `${res.data.name} 维修`,
          loading: false
        })
      } else {
        this.setData({ loading: false })
      }
    } catch (e) {
      this.setData({ loading: false })
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onPriorityChange(e) {
    const priorityIndex = Number(e.detail.value)
    this.setData({
      priorityIndex,
      'form.priority': this.data.priorityOptions[priorityIndex]
    })
  },

  onRepairTypeChange(e) {
    const repairTypeIndex = Number(e.detail.value)
    const repairType = this.data.repairTypeOptions[repairTypeIndex]
    const label = this.data.repairTypeLabels[repairTypeIndex]
    const deviceName = this.data.form.deviceName
    this.setData({
      repairTypeIndex,
      'form.repairType': repairType,
      'form.title': deviceName ? `${deviceName} ${label}` : this.data.form.title
    })
  },

  chooseImage() {
    if (this.data.uploading) return
    wx.chooseMedia({
      count: 6,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async res => {
        await this.uploadImages(res.tempFiles || [])
      }
    })
  },

  async uploadImages(files) {
    this.setData({ uploading: true })
    wx.showLoading({ title: '上传中' })
    try {
      const uploaded = []
      for (const file of files) {
        const filePath = file.tempFilePath || file.path
        const ext = (filePath || '').split('.').pop().toLowerCase() || 'jpg'
        const cloudPath = `workorders/images/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`
        const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath })
        uploaded.push({
          name: cloudPath.split('/').pop(),
          fileID: uploadRes.fileID,
          size: file.size || 0,
          type: 'image'
        })
      }
      this.setData({ 'form.images': this.data.form.images.concat(uploaded) })
    } catch (e) {
      wx.showToast({ title: '图片上传失败', icon: 'none' })
    }
    wx.hideLoading()
    this.setData({ uploading: false })
  },

  removeImage(e) {
    const index = Number(e.currentTarget.dataset.index)
    const images = this.data.form.images.slice()
    images.splice(index, 1)
    this.setData({ 'form.images': images })
  },

  previewImage(e) {
    const current = e.currentTarget.dataset.fileid
    const urls = this.data.form.images.map(item => item.fileID)
    wx.previewImage({ current, urls })
  },

  async saveWorkorder() {
    const form = this.data.form
    if (!form.deviceName || !form.title || !form.description) {
      wx.showToast({ title: '请填写设备、标题和描述', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    wx.showLoading({ title: '提交中' })
    try {
      const res = await api.saveWorkorder(form)
      wx.hideLoading()
      if (res.code === 0) {
        wx.showToast({ title: '已提交', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 700)
      } else {
        wx.showToast({ title: res.message || '提交失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '提交失败', icon: 'none' })
    }
    this.setData({ saving: false })
  }
})
