const api = require('../../services/api')

const app = getApp()

Page({
  data: {
    id: '',
    loading: false,
    saving: false,
    uploading: false,
    uploadingGuide: false,
    form: {
      name: '',
      model: '',
      type: '',
      typeLabel: '',
      location: '',
      area: '',
      position: '',
      code: '',
      manufacturer: '',
      power: '',
      parameters: '',
      maintenanceGuide: {
        text: '',
        files: []
      },
      purchaseDate: '',
      status: 'normal',
      images: [],
      coverImage: ''
    }
  },

  onLoad(options) {
    const userInfo = app.globalData.userInfo
    if (!userInfo || userInfo.role !== 'admin') {
      wx.showToast({ title: '无编辑权限', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    if (options.id) {
      this.setData({ id: options.id })
      this.loadDevice(options.id)
    }
  },

  async loadDevice(id) {
    this.setData({ loading: true })
    try {
      const res = await api.getDeviceDetail(id)
      if (res.code === 0 && res.data) {
        this.setData({
          form: {
            ...this.data.form,
            ...res.data,
            maintenanceGuide: {
              ...this.data.form.maintenanceGuide,
              ...(res.data.maintenanceGuide || {})
            }
          },
          loading: false
        })
        wx.setNavigationBarTitle({ title: '编辑设备' })
      } else {
        wx.showToast({ title: '设备不存在', icon: 'none' })
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
        const cloudPath = `devices/images/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`
        const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath })
        uploaded.push({
          name: cloudPath.split('/').pop(),
          fileID: uploadRes.fileID,
          size: file.size || 0,
          type: 'image'
        })
      }
      const images = this.data.form.images.concat(uploaded)
      this.setData({
        'form.images': images,
        'form.coverImage': this.data.form.coverImage || (images[0] && images[0].fileID) || ''
      })
    } catch (e) {
      wx.showToast({ title: '图片上传失败', icon: 'none' })
    }
    wx.hideLoading()
    this.setData({ uploading: false })
  },

  removeImage(e) {
    const index = Number(e.currentTarget.dataset.index)
    const images = this.data.form.images.slice()
    const removed = images.splice(index, 1)[0]
    const coverImage = removed && removed.fileID === this.data.form.coverImage
      ? (images[0] && images[0].fileID) || ''
      : this.data.form.coverImage
    this.setData({ 'form.images': images, 'form.coverImage': coverImage })
  },

  setCoverImage(e) {
    const { fileid } = e.currentTarget.dataset
    this.setData({ 'form.coverImage': fileid })
    wx.showToast({ title: '已设为封面', icon: 'success' })
  },

  previewImage(e) {
    const current = e.currentTarget.dataset.fileid
    const urls = this.data.form.images.map(item => item.url || item.fileID)
    wx.previewImage({ current, urls })
  },

  chooseGuideFile() {
    if (this.data.uploadingGuide) return
    wx.chooseMessageFile({
      count: 3,
      type: 'file',
      extension: ['doc', 'docx', 'pdf'],
      success: async res => {
        await this.uploadGuideFiles(res.tempFiles || [])
      }
    })
  },

  async uploadGuideFiles(files) {
    const allowExt = ['doc', 'docx', 'pdf']
    const validFiles = files.filter(file => allowExt.includes((file.name || file.path || '').split('.').pop().toLowerCase()))
    if (!validFiles.length) {
      wx.showToast({ title: '请选择 Word 或 PDF 文件', icon: 'none' })
      return
    }

    this.setData({ uploadingGuide: true })
    wx.showLoading({ title: '上传中' })
    try {
      const uploaded = []
      for (const file of validFiles) {
        const filePath = file.path
        const ext = (file.name || filePath || '').split('.').pop().toLowerCase()
        const safeName = file.name || `guide.${ext}`
        const cloudPath = `devices/guides/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`
        const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath })
        uploaded.push({
          name: safeName,
          fileID: uploadRes.fileID,
          size: file.size || 0,
          type: ext
        })
      }
      const currentFiles = (this.data.form.maintenanceGuide && this.data.form.maintenanceGuide.files) || []
      this.setData({ 'form.maintenanceGuide.files': currentFiles.concat(uploaded) })
    } catch (e) {
      wx.showToast({ title: '指南上传失败', icon: 'none' })
    }
    wx.hideLoading()
    this.setData({ uploadingGuide: false })
  },

  removeGuideFile(e) {
    const index = Number(e.currentTarget.dataset.index)
    const files = ((this.data.form.maintenanceGuide && this.data.form.maintenanceGuide.files) || []).slice()
    files.splice(index, 1)
    this.setData({ 'form.maintenanceGuide.files': files })
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

  async saveDevice() {
    if (this.data.saving) return
    const form = this.data.form
    if (!form.name || !form.model || !form.type || !form.location) {
      wx.showToast({ title: '请填写名称、型号、类型、位置', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中' })
    try {
      const res = await api.saveDevice(form)
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
  },

  deleteDevice() {
    if (!this.data.form.id && !this.data.form._id) return
    wx.showModal({
      title: '删除设备',
      content: '删除后设备将从目录中隐藏，确认删除吗？',
      confirmColor: '#EF4444',
      success: async res => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中' })
        try {
          const id = this.data.form.id || this.data.form._id
          const result = await api.deleteDevice(id)
          wx.hideLoading()
          if (result.code === 0) {
            wx.showToast({ title: '已删除', icon: 'success' })
            setTimeout(() => wx.navigateBack({ delta: 2 }), 700)
          } else {
            wx.showToast({ title: result.message || '删除失败', icon: 'none' })
          }
        } catch (e) {
          wx.hideLoading()
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  }
})
