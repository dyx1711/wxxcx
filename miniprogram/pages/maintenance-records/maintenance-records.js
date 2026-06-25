const api = require('../../services/api')

const app = getApp()

function inferCategory(record) {
  if (record.category === 'maintain' || record.category === 'repair') return record.category
  const text = `${record.type || ''}${record.result || ''}`
  if (text.includes('保养') || text.toLowerCase().includes('maintain')) return 'maintain'
  return 'repair'
}

function decorateRecord(record) {
  const category = inferCategory(record)
  return {
    ...record,
    category,
    categoryLabel: category === 'maintain' ? '保养' : '维修'
  }
}

Page({
  data: {
    allRecords: [],
    records: [],
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'maintain', label: '保养' },
      { key: 'repair', label: '维修' }
    ],
    activeTab: 'all',
    loading: true,
    deviceId: '',
    canEdit: false,
    canDelete: false
  },

  onLoad(options = {}) {
    const permissions = app.globalData.userInfo && app.globalData.userInfo.permissions
    const userInfo = app.globalData.userInfo
    this.setData({
      deviceId: options.deviceId || '',
      canEdit: !!(permissions && permissions.canEdit),
      canDelete: !!(userInfo && userInfo.role === 'admin')
    })
    this.loadRecords()
  },

  onShow() {
    if (this.data.deviceId || this.data.allRecords.length) {
      this.loadRecords()
    }
  },

  async loadRecords() {
    this.setData({ loading: true })
    try {
      const res = await api.getMaintenanceRecords({ deviceId: this.data.deviceId })
      if (res.code === 0) {
        const allRecords = (res.data.list || []).map(decorateRecord)
        this.setData({ allRecords, loading: false })
        this.applyFilter()
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' })
        this.setData({ loading: false })
      }
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.key })
    this.applyFilter()
  },

  applyFilter() {
    const { activeTab, allRecords } = this.data
    const records = activeTab === 'all' ? allRecords : allRecords.filter(item => item.category === activeTab)
    this.setData({ records })
  },

  addRecord() {
    const query = this.data.deviceId ? `?deviceId=${this.data.deviceId}` : ''
    wx.navigateTo({ url: `/pages/maintenance-edit/maintenance-edit${query}` })
  },

  editRecord(e) {
    if (!this.data.canEdit) return
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/maintenance-edit/maintenance-edit?id=${id}` })
  },

  deleteRecord(e) {
    const { id } = e.currentTarget.dataset
    wx.showModal({
      title: '删除记录',
      content: '确认删除这条维修保养记录吗？',
      confirmColor: '#EF4444',
      success: async res => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中' })
        try {
          const result = await api.deleteMaintenanceRecord(id)
          wx.hideLoading()
          if (result.code === 0) {
            wx.showToast({ title: '已删除', icon: 'success' })
            this.loadRecords()
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

  openFile(e) {
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

  previewImage(e) {
    const { fileid, recordIndex } = e.currentTarget.dataset
    const record = this.data.records[Number(recordIndex)]
    const urls = (record.images || []).map(item => item.url || item.fileID)
    wx.previewImage({ current: fileid, urls })
  }
})
