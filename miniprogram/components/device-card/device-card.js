Component({
  properties: {
    device: { type: Object, value: {} }
  },

  methods: {
    onTap() {
      const { id } = this.properties.device
      if (id) {
        wx.navigateTo({ url: `/pages/device-detail/device-detail?id=${id}` })
      }
    }
  }
})
