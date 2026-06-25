const api = require('../../services/api')

Component({
  properties: {
    device: { type: Object, value: {} }
  },

  methods: {
    onTap() {
      const { id } = this.properties.device
      if (id) {
        api.getDeviceDetail(id).catch(() => {})
        wx.navigateTo({ url: `/pages/device-detail/device-detail?id=${id}` })
      }
    }
  }
})
