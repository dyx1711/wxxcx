const cloud = require('wx-server-sdk')

cloud.init({ env: 'dyx0214-d4gg0btzz41aeafe8' })

const db = cloud.database()
const _ = db.command
const USERS = 'users'
const DEVICES = 'devices'
const WORKORDERS = 'repair_workorders'
const ENERGY = 'energy_records'

const MAIN_DEVICE_AREAS = [
  {
    key: 'secondaryPumpRoom',
    title: '二级泵房',
    names: ['1#输水泵', '2#输水泵', '3#输水泵', '4#输水泵']
  },
  {
    key: 'sodiumHypochloriteRoom',
    title: '次氯酸钠加药间',
    names: ['1#前加氯', '2#前加氯', '3#前加氯', '4#主加氯', '5#主加氯', '6#主加氯', '7#补加氯', '8#补加氯', '9#补加氯']
  },
  {
    key: 'blowerRoom',
    title: '鼓风机房',
    names: ['1#反洗风机', '2#反洗风机', '1#曝气风机', '2#曝气风机', '3#曝气风机']
  }
]

function ok(data) {
  return { code: 0, data }
}

function fail(code, message) {
  return { code, message }
}

async function getUser(openid) {
  const res = await db.collection(USERS).where({ openid, status: 'active' }).limit(1).get()
  return res.data[0]
}

function canView(user) {
  return user && (user.role === 'admin' || user.permissions && user.permissions.canView)
}

function canManage(user) {
  return user && user.role === 'admin'
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function monthKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

function weekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${pad(week)}`
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function addMonths(date, months) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function periodLabel(periodType, key) {
  if (periodType === 'week') return key.replace('-W', ' W')
  if (periodType === 'month') return key
  return key.slice(5)
}

function recentKeys(periodType) {
  const now = new Date()
  if (periodType === 'month') {
    return Array.from({ length: 6 }, (_, i) => monthKey(addMonths(now, i - 5)))
  }
  if (periodType === 'week') {
    return Array.from({ length: 8 }, (_, i) => weekKey(addDays(now, (i - 7) * 7)))
  }
  return Array.from({ length: 7 }, (_, i) => formatDate(addDays(now, i - 6)))
}

function buildRecentTrend(records, periodType) {
  const keys = recentKeys(periodType)
  const bucket = {}
  records.forEach(item => {
    if (item.periodType !== periodType) return
    bucket[item.periodKey] = (bucket[item.periodKey] || 0) + Number(item.energy || 0)
  })
  const values = keys.map(key => Number((bucket[key] || 0).toFixed(2)))
  const max = Math.max(...values, 1)
  return {
    total: Number(values.reduce((sum, value) => sum + value, 0).toFixed(2)),
    unit: 'kWh',
    data: keys.map((key, index) => ({
      key,
      label: periodLabel(periodType, key),
      value: Math.round(values[index] / max * 100),
      rawValue: values[index]
    }))
  }
}

function normalizeRepairType(value) {
  return value === 'maintain' ? 'maintain' : 'repair'
}

function isFaultStatus(status) {
  return ['fault', 'alert', 'warning', 'repair'].includes(status)
}

function percent(count, total) {
  return total ? Math.round(count / total * 100) : 0
}

function normalizeTodo(item) {
  const priorityMap = {
    urgent: '紧急',
    high: '高',
    normal: '普通',
    low: '低'
  }
  const kind = normalizeRepairType(item.repairType)
  return {
    ...item,
    id: item._id,
    type: kind,
    typeLabel: kind === 'maintain' ? '保养' : '维修',
    repairType: kind,
    repairTypeLabel: kind === 'maintain' ? '保养' : '维修',
    priorityLabel: priorityMap[item.priority] || '普通',
    deadlineClass: item.priority === 'urgent' || item.priority === 'high' ? 'danger' : 'muted',
    createdAt: item.createdAtText || '',
    assignee: item.assigneeName || '待派工'
  }
}

async function addTodoImageAccessUrls(todos = []) {
  const fileIDs = Array.from(new Set(todos.flatMap(todo => (
    (todo.images || []).map(image => image.fileID).filter(Boolean)
  ))))
  if (!fileIDs.length) return todos

  const urlMap = {}
  for (let i = 0; i < fileIDs.length; i += 50) {
    const fileList = fileIDs.slice(i, i + 50)
    const result = await cloud.getTempFileURL({ fileList }).catch(() => ({ fileList: [] }))
    ;(result.fileList || []).forEach(file => {
      if (file.fileID && file.tempFileURL) urlMap[file.fileID] = file.tempFileURL
    })
  }

  return todos.map(todo => ({
    ...todo,
    images: (todo.images || []).map(image => ({
      ...image,
      url: urlMap[image.fileID] || image.fileID
    }))
  }))
}

function buildDeviceLookup(devices) {
  return devices.reduce((acc, item) => {
    acc.byId[item._id] = item
    if (item.name) acc.byName[item.name] = item
    return acc
  }, { byId: {}, byName: {} })
}

function getOrderDeviceId(order, lookup) {
  if (order.deviceId && lookup.byId[order.deviceId]) return order.deviceId
  if (order.deviceName && lookup.byName[order.deviceName]) return lookup.byName[order.deviceName]._id
  return ''
}

function normalizeDeviceName(name = '') {
  return String(name).replace(/\s+/g, '').trim()
}

function getMainDeviceStatus(items, repairDeviceIds, maintainDeviceIds) {
  if (!items.length) {
    return {
      status: 'unknown',
      statusLabel: '未录入',
      statusClass: 'orange'
    }
  }

  const hasFault = items.some(device => repairDeviceIds.has(device._id) || isFaultStatus(device.status))
  if (hasFault) {
    return {
      status: 'fault',
      statusLabel: '故障',
      statusClass: 'red'
    }
  }

  const hasMaintain = items.some(device => maintainDeviceIds.has(device._id))
  if (hasMaintain) {
    return {
      status: 'maintain',
      statusLabel: '待保养',
      statusClass: 'orange'
    }
  }

  return {
    status: 'normal',
    statusLabel: '运行',
    statusClass: 'green'
  }
}

function buildMainDeviceAreas(devices, repairDeviceIds, maintainDeviceIds) {
  const deviceGroups = devices.reduce((acc, device) => {
    const name = normalizeDeviceName(device.name)
    if (!name) return acc
    if (!acc[name]) acc[name] = []
    acc[name].push(device)
    return acc
  }, {})

  return MAIN_DEVICE_AREAS.map(area => ({
    key: area.key,
    title: area.title,
    devices: area.names.map(name => {
      const items = deviceGroups[normalizeDeviceName(name)] || []
      return {
        name,
        count: items.length,
        ...getMainDeviceStatus(items, repairDeviceIds, maintainDeviceIds)
      }
    })
  }))
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  const user = await getUser(OPENID)
  if (!canView(user)) return fail(403, 'No permission to view dashboard')

  const devicesRes = await db.collection(DEVICES).where({ deleted: _.neq(true) }).limit(1000).get()
  const devices = devicesRes.data
  const totalDevices = devices.length
  const lookup = buildDeviceLookup(devices)

  const ordersRes = await db.collection(WORKORDERS).where({
    deleted: _.neq(true),
    status: _.neq('completed')
  }).orderBy('updatedAt', 'desc').limit(200).get()
  const activeOrders = ordersRes.data.filter(order => getOrderDeviceId(order, lookup))
  const visibleTodos = canManage(user)
    ? activeOrders
    : activeOrders.filter(item => item.assigneeOpenid === OPENID || item.reporterOpenid === OPENID)
  const todos = await addTodoImageAccessUrls(visibleTodos.slice(0, 5).map(normalizeTodo))

  const pendingMaintainOrders = activeOrders.filter(item => normalizeRepairType(item.repairType) === 'maintain')
  const pendingRepairOrders = activeOrders.filter(item => normalizeRepairType(item.repairType) === 'repair')

  const maintainTypeMap = pendingMaintainOrders.reduce((acc, order) => {
    const deviceId = getOrderDeviceId(order, lookup)
    const device = deviceId && lookup.byId[deviceId]
    const type = order.deviceType || device && (device.type || device.typeLabel) || '未分类'
    acc[type] = (acc[type] || 0) + 1
    return acc
  }, {})
  const maintenanceTypes = Object.keys(maintainTypeMap)
    .map(type => ({ type, count: maintainTypeMap[type] }))
    .sort((a, b) => b.count - a.count)

  const repairDeviceIds = new Set()
  pendingRepairOrders.forEach(order => {
    const deviceId = getOrderDeviceId(order, lookup)
    if (deviceId) repairDeviceIds.add(deviceId)
  })

  const maintainDeviceIds = new Set()
  pendingMaintainOrders.forEach(order => {
    const deviceId = getOrderDeviceId(order, lookup)
    if (deviceId) maintainDeviceIds.add(deviceId)
  })

  const faultDeviceIds = new Set()
  devices.forEach(device => {
    if (repairDeviceIds.has(device._id) || isFaultStatus(device.status)) {
      faultDeviceIds.add(device._id)
    }
  })

  const maintainCount = devices.filter(device => (
    maintainDeviceIds.has(device._id) && !faultDeviceIds.has(device._id)
  )).length
  const faultCount = faultDeviceIds.size
  const onlineCount = Math.max(totalDevices - faultCount - maintainCount, 0)

  const energyRes = await db.collection(ENERGY).where({ deleted: _.neq(true) }).limit(1000).get()
  const energyRecords = energyRes.data
  const statusOverview = {
    total: totalDevices,
    online: { count: onlineCount, percent: percent(onlineCount, totalDevices) },
    fault: { count: faultCount, percent: percent(faultCount, totalDevices) },
    maintain: { count: maintainCount, percent: percent(maintainCount, totalDevices) },
    pie: [
      { label: '在线', key: 'online', count: onlineCount, percent: percent(onlineCount, totalDevices), color: '#22C55E' },
      { label: '故障', key: 'fault', count: faultCount, percent: percent(faultCount, totalDevices), color: '#EF4444' },
      { label: '待保养', key: 'maintain', count: maintainCount, percent: percent(maintainCount, totalDevices), color: '#F97316' }
    ]
  }

  const mainDeviceAreas = buildMainDeviceAreas(devices, repairDeviceIds, maintainDeviceIds)

  return ok({
    totalDevices,
    pendingMaintain: pendingMaintainOrders.length,
    pendingRepair: pendingRepairOrders.length,
    maintenanceTypes,
    todos,
    statusOverview,
    mainDeviceAreas,
    energyDay: buildRecentTrend(energyRecords, 'day'),
    energyWeek: buildRecentTrend(energyRecords, 'week'),
    energyMonth: buildRecentTrend(energyRecords, 'month')
  })
}
