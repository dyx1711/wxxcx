const api = require('../../services/api')

const app = getApp()

function today() {
  const date = new Date()
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

Page({
  data: {
    id: '',
    loading: false,
    saving: false,
    uploading: false,
    form: {
      deviceId: '',
      deviceName: '',
      type: '',
      date: today(),
      operator: '',
      result: '',
      content: '',
      files: [],
      images: []
    }
  },

  onLoad(options = {}) {
    const permissions = app.globalData.userInfo && app.globalData.userInfo.permissions
    if (!permissions || !permissions.canEdit) {
      wx.showToast({ title: '无编辑权限', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    this.setData({ 'form.operator': app.globalData.userInfo.nickName || '' })
    if (options.id) {
      this.setData({ id: options.id })
      this.loadRecord(options.id)
      return
    }
    if (options.deviceId) {
      this.setData({ 'form.deviceId': options.deviceId })
      this.loadDevice(options.deviceId)
    }
  },

  async loadDevice(id) {
    try {
      const res = await api.getDeviceDetail(id)
      if (res.code === 0 && res.data) {
        this.setData({ 'form.deviceName': res.data.name })
      }
    } catch (e) {}
  },

  async loadRecord(id) {
    this.setData({ loading: true })
    try {
      const res = await api.getMaintenanceRecord(id)
      if (res.code === 0 && res.data) {
        this.setData({ form: { ...this.data.form, ...res.data }, loading: false })
        wx.setNavigationBarTitle({ title: '编辑维修保养记录' })
      } else {
        wx.showToast({ title: '记录不存在', icon: 'none' })
        this.setData({ loading: false })
      }
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onDateChange(e) {
    this.setData({ 'form.date': e.detail.value })
  },

  chooseFile() {
    if (this.data.uploading) return
    wx.chooseMessageFile({
      count: 3,
      type: 'file',
      extension: ['doc', 'docx', 'pdf'],
      success: async res => {
        const files = res.tempFiles || []
        await this.uploadFiles(files)
      }
    })
  },

  async uploadFiles(files) {
    this.setData({ uploading: true })
    wx.showLoading({ title: '上传中' })
    try {
      const uploaded = []
      for (const file of files) {
        const ext = (file.name || '').split('.').pop().toLowerCase()
        if (!['doc', 'docx', 'pdf'].includes(ext)) {
          wx.showToast({ title: '仅支持 Word/PDF', icon: 'none' })
          continue
        }
        const cloudPath = `maintenance/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`
        const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: file.path })
        uploaded.push({
          name: file.name,
          fileID: uploadRes.fileID,
          size: file.size,
          type: ext
        })
      }
      this.setData({ 'form.files': this.data.form.files.concat(uploaded) })
    } catch (e) {
      wx.showToast({ title: '上传失败', icon: 'none' })
    }
    wx.hideLoading()
    this.setData({ uploading: false })
  },

  removeFile(e) {
    const index = Number(e.currentTarget.dataset.index)
    const files = this.data.form.files.slice()
    files.splice(index, 1)
    this.setData({ 'form.files': files })
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
        const cloudPath = `maintenance/images/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`
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
    const urls = this.data.form.images.map(item => item.url || item.fileID)
    wx.previewImage({ current, urls })
  },

  async saveRecord() {
    if (this.data.saving) return
    const form = this.data.form
    if (!form.deviceName || !form.type || !form.date || !form.operator) {
      wx.showToast({ title: '请填写设备、类型、日期、操作人', icon: 'none' })
      return
    }
    if (!form.content && !form.files.length && !form.images.length) {
      wx.showToast({ title: '请填写记录或上传文档/图片', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中' })
    try {
      const res = await api.saveMaintenanceRecord(form)
      wx.hideLoading()
      if (res.code === 0) {
        wx.showToast({ title: '已保存', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 600)
      } else {
        wx.showToast({ title: res.message || '保存失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
    this.setData({ saving: false })
  }
})
