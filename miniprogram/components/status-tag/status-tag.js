Component({
  properties: {
    status: { type: String, value: 'normal' },
    text: { type: String, value: '' }
  },

  observers: {
    status(val) {
      const map = {
        normal: '在线',
        online: '在线',
        running: '运行',
        maintain: '待保养',
        alert: '故障',
        offline: '离线',
        fault: '故障'
      }
      if (!this.properties.text) {
        this.setData({ label: map[val] || val })
      }
    },
    text(val) {
      if (val) this.setData({ label: val })
    }
  },

  data: {
    label: '在线'
  }
})
