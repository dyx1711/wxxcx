const cloud = require('wx-server-sdk')

cloud.init({ env: 'dyx0214-d4gg0btzz41aeafe8' })

const db = cloud.database()
const _ = db.command
const USERS = 'users'
const DEVICES = 'devices'
const WORKORDERS = 'repair_workorders'
const CONFIG = 'app_config'
const SUBSCRIBE_CONFIG_ID = 'subscribeMessage'

const DEFAULT_FIELD_MAPS = {
  maintenanceCreated: {
    deviceName: 'thing1',
    title: 'thing2',
    dueDate: 'date3',
    status: 'phrase4'
  }
}

function ok(data) {
  return { code: 0, data }
}

async function getSubscribeConfig() {
  const res = await db.collection(CONFIG).doc(SUBSCRIBE_CONFIG_ID).get().catch(() => null)
  const data = res && res.data || {}
  return {
    maintenanceCreatedTemplateId: data.maintenanceCreatedTemplateId || process.env.MAINTENANCE_CREATED_TEMPLATE_ID || '',
    miniprogramState: data.miniprogramState || process.env.WECHAT_MINIPROGRAM_STATE || 'formal',
    fieldMaps: {
      maintenanceCreated: {
        ...DEFAULT_FIELD_MAPS.maintenanceCreated,
        ...(data.fieldMaps && data.fieldMaps.maintenanceCreated)
      }
    }
  }
}

function fieldLimit(field = '') {
  if (field.startsWith('phrase')) return 5
  if (field.startsWith('thing')) return 20
  if (field.startsWith('name')) return 10
  return 32
}

function templateValue(value, field) {
  const text = String(value || '').replace(/\s+/g, ' ').trim() || '-'
  const limit = fieldLimit(field)
  return text.length > limit ? text.slice(0, limit) : text
}

function buildTemplateData(fieldMap = {}, values = {}) {
  return Object.keys(fieldMap).reduce((data, key) => {
    const field = fieldMap[key]
    if (field) data[field] = { value: templateValue(values[key], field) }
    return data
  }, {})
}

function canReceiveSubscribe(user, key) {
  const prefs = user && user.subscribeMessages
  return !!(prefs && prefs.enabled && prefs[key])
}

async function sendSubscribeMessage(touser, templateId, page, data, miniprogramState) {
  if (!touser || !templateId) return null
  return cloud.openapi.subscribeMessage.send({
    touser,
    templateId,
    page,
    data,
    miniprogramState,
    lang: 'zh_CN'
  }).catch(err => {
    console.warn('subscribeMessage.send failed', err)
    return null
  })
}

async function getSubscribedAdmins(key) {
  const res = await db.collection(USERS).where({
    status: 'active',
    role: 'admin'
  }).field({
    openid: true,
    subscribeMessages: true
  }).limit(200).get().catch(() => ({ data: [] }))
  return res.data.filter(user => canReceiveSubscribe(user, key))
}

async function notifyMaintenanceCreated(device, dueDate, orderId) {
  const config = await getSubscribeConfig()
  if (!config.maintenanceCreatedTemplateId) return null
  const admins = await getSubscribedAdmins('maintenanceCreated')
  if (!admins.length) return null
  const data = buildTemplateData(config.fieldMaps.maintenanceCreated, {
    deviceName: device.name || '设备',
    title: '定期保养工单',
    dueDate: formatDate(dueDate),
    status: '待派工'
  })
  return Promise.all(admins.map(admin => sendSubscribeMessage(
    admin.openid,
    config.maintenanceCreatedTemplateId,
    `pages/workorder-detail/workorder-detail?id=${orderId}`,
    data,
    config.miniprogramState
  )))
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatDateTime(date) {
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function addMonths(date, months) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function normalizeCycleMonths(value) {
  const months = Math.floor(Number(value || 0))
  if (!Number.isFinite(months) || months < 0) return 0
  return Math.min(months, 120)
}

function parseDateValue(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof value === 'object') {
    const raw = value.$date || value.date || value.value
    if (raw) return parseDateValue(raw)
  }
  return null
}

function getMaintenanceDueDate(device = {}) {
  const cycleMonths = normalizeCycleMonths(device.maintenanceCycleMonths)
  if (!cycleMonths) return null
  const storedNext = parseDateValue(device.maintenanceNextAt) || parseDateValue(device.maintenanceNextAtText)
  if (storedNext) return storedNext
  const baseline = parseDateValue(device.maintenanceLastAt) ||
    parseDateValue(device.maintenanceLastAtText) ||
    parseDateValue(device.purchaseDate) ||
    parseDateValue(device.createdAt) ||
    parseDateValue(device.updatedAt)
  return baseline ? addMonths(baseline, cycleMonths) : null
}

function hasOpenMaintainOrder(device, openMaintainOrders = []) {
  return openMaintainOrders.some(order => (
    order.deviceId === device._id ||
    (!order.deviceId && device.name && order.deviceName === device.name)
  ))
}

async function createMaintenanceWorkorder(device, dueDate) {
  const now = db.serverDate()
  const textTime = formatDateTime(new Date())
  const dueText = formatDate(dueDate)
  const cycleMonths = normalizeCycleMonths(device.maintenanceCycleMonths)
  const addRes = await db.collection(WORKORDERS).add({
    data: {
      deviceId: device._id,
      deviceName: device.name || '',
      deviceType: device.type || device.typeLabel || '',
      location: device.location || '',
      repairType: 'maintain',
      repairTypeLabel: '保养',
      type: 'maintain',
      typeLabel: '保养',
      no: `BY-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      title: `${device.name || '设备'} 定期保养`,
      faultType: '周期保养',
      description: `设备已到保养周期（每${cycleMonths}个月），请按维修指南执行定期保养。`,
      priority: 'normal',
      deadline: dueText,
      status: 'pending',
      reporterOpenid: 'system',
      reporterName: '系统自动生成',
      assigneeOpenid: '',
      assigneeName: '',
      images: [],
      traces: [],
      progress: [
        { title: '工单创建', desc: `${textTime} · 系统自动生成`, done: true },
        { title: '等待派工', desc: '管理员派送给处理人', done: false }
      ],
      autoGenerated: true,
      autoReason: 'maintenance_cycle_due',
      maintenanceCycleMonths: cycleMonths,
      maintenanceDueAt: dueDate,
      maintenanceDueAtText: dueText,
      deleted: false,
      createdAt: now,
      updatedAt: now,
      createdAtText: textTime,
      updatedAtText: textTime,
      createdBy: 'system',
      updatedBy: 'system'
    }
  })
  return addRes._id
}

exports.main = async () => {
  const devicesRes = await db.collection(DEVICES).where({
    deleted: _.neq(true),
    maintenanceCycleMonths: _.gt(0)
  }).field({
    _id: true,
    name: true,
    type: true,
    typeLabel: true,
    location: true,
    purchaseDate: true,
    maintenanceCycleMonths: true,
    maintenanceLastAt: true,
    maintenanceLastAtText: true,
    maintenanceNextAt: true,
    maintenanceNextAtText: true,
    createdAt: true,
    updatedAt: true
  }).limit(1000).get()

  const now = new Date()
  const dueDevices = devicesRes.data
    .map(device => ({ device, dueDate: getMaintenanceDueDate(device) }))
    .filter(item => item.dueDate && item.dueDate.getTime() <= now.getTime())

  if (!dueDevices.length) return ok({ checkedCount: devicesRes.data.length, createdCount: 0 })

  const maintainRes = await db.collection(WORKORDERS).where({
    deleted: _.neq(true),
    status: _.neq('completed'),
    repairType: 'maintain'
  }).field({
    deviceId: true,
    deviceName: true
  }).limit(1000).get().catch(() => ({ data: [] }))

  const created = []
  for (const item of dueDevices) {
    if (hasOpenMaintainOrder(item.device, maintainRes.data)) continue
    const id = await createMaintenanceWorkorder(item.device, item.dueDate).catch(() => '')
    if (id) {
      created.push({ id, deviceId: item.device._id, deviceName: item.device.name })
      maintainRes.data.push({ _id: id, deviceId: item.device._id, deviceName: item.device.name })
      await notifyMaintenanceCreated(item.device, item.dueDate, id).catch(() => null)
    }
  }

  return ok({
    checkedCount: devicesRes.data.length,
    dueCount: dueDevices.length,
    createdCount: created.length,
    created
  })
}
