function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date)
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${y}年${m}月${day}日 星期${weekDays[d.getDay()]}`
}

function statusText(status) {
  const map = {
    online: '正常',
    normal: '正常',
    alert: '告警',
    offline: '离线',
    fault: '故障'
  }
  return map[status] || status
}

function statusClass(status) {
  const map = {
    online: 'success',
    normal: 'success',
    alert: 'danger',
    offline: 'muted',
    fault: 'danger'
  }
  return map[status] || 'muted'
}

function debounce(fn, delay) {
  let timer = null
  return function (...args) {
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), delay)
  }
}

module.exports = {
  formatDate,
  statusText,
  statusClass,
  debounce
}
