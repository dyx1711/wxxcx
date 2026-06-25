const api = require('../../services/api')
const { debounce } = require('../../utils/format')

const app = getApp()

Page({
  data: {
    isLoggedIn: false,
    keyword: '',
    locations: ['全部'],
    types: ['全部'],
    selectedLocation: '全部',
    selectedType: '全部',
    activeTags: [],
    devices: [],
    loading: true,
    page: 1,
    hasMore: true,
    loadingMore: false,
    mineOnly: false,
    canEdit: false
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    const isLoggedIn = app.globalData.isLoggedIn
    const mineOnly = app.globalData.catalogMineOnly
    if (mineOnly) {
      app.globalData.catalogMineOnly = false
    }
    const userInfo = app.globalData.userInfo
    this.setData({ isLoggedIn, mineOnly: !!mineOnly, canEdit: !!(userInfo && userInfo.role === 'admin') })
    if (isLoggedIn) {
      wx.setNavigationBarTitle({ title: mineOnly ? '我的设备' : '目录' })
      this.resetAndLoad()
    } else {
      this.setData({ loading: false, devices: [] })
    }
  },

  onSearchInput: debounce(function (e) {
    this.setData({ keyword: e.detail.value })
    this.resetAndLoad()
  }, 300),

  onSearchConfirm(e) {
    this.setData({ keyword: e.detail.value })
    this.resetAndLoad()
  },

  selectLocation(e) {
    const val = e.currentTarget.dataset.val
    this.setData({ selectedLocation: val })
    this.updateTags()
    this.resetAndLoad()
  },

  selectType(e) {
    const val = e.currentTarget.dataset.val
    this.setData({ selectedType: val })
    this.updateTags()
    this.resetAndLoad()
  },

  updateTags() {
    const tags = []
    if (this.data.selectedLocation !== '全部') tags.push(this.data.selectedLocation)
    if (this.data.selectedType !== '全部') tags.push(this.data.selectedType)
    this.setData({ activeTags: tags })
  },

  removeTag(e) {
    const tag = e.currentTarget.dataset.tag
    if (this.data.selectedLocation === tag) {
      this.setData({ selectedLocation: '全部' })
    }
    if (this.data.selectedType === tag) {
      this.setData({ selectedType: '全部' })
    }
    this.updateTags()
    this.resetAndLoad()
  },

  resetFilters() {
    this.setData({ selectedLocation: '全部', selectedType: '全部', keyword: '', activeTags: [] })
    this.resetAndLoad()
  },

  resetAndLoad() {
    this.setData({ page: 1, hasMore: true, devices: [] })
    this.loadDevices()
  },

  async loadDevices() {
    if (!app.globalData.isLoggedIn) return
    const { page, keyword, selectedLocation, selectedType, devices, loadingMore } = this.data
    if (loadingMore) return
    this.setData({ loading: page === 1, loadingMore: page > 1 })
    try {
      const res = await api.getDevices({
        keyword,
        location: selectedLocation,
        type: selectedType,
        mineOnly: this.data.mineOnly,
        page,
        pageSize: 10
      })
      if (res.code === 0) {
        const list = page === 1 ? res.data.list : devices.concat(res.data.list)
        this.setData({
          devices: list,
          locations: res.data.locations || this.data.locations,
          types: res.data.types || this.data.types,
          hasMore: res.data.hasMore,
          loading: false,
          loadingMore: false
        })
      }
    } catch (e) {
      wx.showToast({ title: '加载失败，点击重试', icon: 'none' })
      this.setData({ loading: false, loadingMore: false })
    }
  },

  onPullDownRefresh() {
    if (!app.globalData.isLoggedIn) {
      wx.stopPullDownRefresh()
      return
    }
    this.resetAndLoad()
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore) return
    this.setData({ page: this.data.page + 1 })
    this.loadDevices()
  },

  goLogin() {
    wx.switchTab({ url: '/pages/mine/mine' })
  },

  goDeviceDetail(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/device-detail/device-detail?id=${id}` })
  },

  goCreateDevice() {
    if (!this.data.canEdit) {
      wx.showToast({ title: '无编辑权限', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/device-edit/device-edit' })
  }
})
