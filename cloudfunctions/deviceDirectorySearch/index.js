const cloud = require('wx-server-sdk')

cloud.init({ env: 'dyx0214-d4gg0btzz41aeafe8' })

const db = cloud.database()
const _ = db.command
const DEVICES = 'devices'
const USERS = 'users'
const WORKORDERS = 'repair_workorders'

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

function normalizeDisplayStatus(device, maintainDeviceIds = new Set()) {
  if (maintainDeviceIds.has(device._id)) {
    return { displayStatus: 'maintain', displayStatusLabel: '待保养' }
  }

  const status = device.status || 'normal'
  if (status === 'running') return { displayStatus: 'running', displayStatusLabel: '运行' }
  if (['fault', 'alert', 'warning', 'repair'].includes(status)) {
    return { displayStatus: 'fault', displayStatusLabel: '故障' }
  }
  if (status === 'offline') return { displayStatus: 'offline', displayStatusLabel: '离线' }
  return { displayStatus: 'online', displayStatusLabel: '在线' }
}

function normalizeDevice(device, maintainDeviceIds = new Set()) {
  return {
    ...device,
    id: device._id,
    typeLabel: device.typeLabel || device.type,
    position: device.position || '',
    ...normalizeDisplayStatus(device, maintainDeviceIds)
  }
}

function toDeviceListItem(device) {
  return {
    _id: device._id,
    id: device.id || device._id,
    name: device.name || '',
    code: device.code || '',
    model: device.model || '',
    type: device.type || '',
    typeLabel: device.typeLabel || device.type || '',
    location: device.location || '',
    area: device.area || '',
    position: device.position || '',
    manufacturer: device.manufacturer || '',
    status: device.status || 'normal',
    displayStatus: device.displayStatus,
    displayStatusLabel: device.displayStatusLabel,
    coverImage: device.coverImage || '',
    coverImageUrl: device.coverImageUrl || '',
    images: Array.isArray(device.images) ? device.images.slice(0, 1) : [],
    updatedAt: device.updatedAt || ''
  }
}

async function addFileAccessUrls(devices = [], options = {}) {
  const includeAllImages = options.includeAllImages !== false
  const includeGuideFiles = options.includeGuideFiles !== false
  const fileIDs = []
  devices.forEach(device => {
    if (device.coverImage) fileIDs.push(device.coverImage)
    const imageList = includeAllImages ? (device.images || []) : (device.images || []).slice(0, 1)
    ;(imageList || []).forEach(image => {
      if (image.fileID) fileIDs.push(image.fileID)
    })
    if (includeGuideFiles) {
      const guide = device.maintenanceGuide || {}
      ;(guide.files || []).forEach(file => {
        if (file.fileID) fileIDs.push(file.fileID)
      })
    }
  })

  const uniqueFileIDs = Array.from(new Set(fileIDs))
  if (!uniqueFileIDs.length) return devices

  const urlMap = {}
  for (let i = 0; i < uniqueFileIDs.length; i += 50) {
    const fileList = uniqueFileIDs.slice(i, i + 50)
    const result = await cloud.getTempFileURL({ fileList }).catch(() => ({ fileList: [] }))
    ;(result.fileList || []).forEach(file => {
      if (file.fileID && file.tempFileURL) urlMap[file.fileID] = file.tempFileURL
    })
  }

  return devices.map(device => ({
    ...device,
    coverImageUrl: urlMap[device.coverImage] || device.coverImage || '',
    images: (device.images || []).map((image, index) => ({
      ...image,
      url: includeAllImages || index === 0 ? (urlMap[image.fileID] || image.fileID) : (image.url || image.fileID)
    })),
    maintenanceGuide: {
      ...(device.maintenanceGuide || {}),
      files: includeGuideFiles ? ((device.maintenanceGuide && device.maintenanceGuide.files) || []).map(file => ({
        ...file,
        url: urlMap[file.fileID] || file.fileID
      })) : ((device.maintenanceGuide && device.maintenanceGuide.files) || [])
    }
  }))
}

async function getMaintainDeviceIds(devices) {
  if (!devices.length) return new Set()
  const maintainRes = await db.collection(WORKORDERS).where({
    deleted: _.neq(true),
    status: _.neq('completed'),
    repairType: 'maintain'
  }).field({
    deviceId: true,
    deviceName: true
  }).limit(1000).get().catch(() => ({ data: [] }))

  const ids = new Set()
  maintainRes.data.forEach(order => {
    if (order.deviceId) {
      ids.add(order.deviceId)
      return
    }
    if (!order.deviceName) return
    const device = devices.find(item => item.name === order.deviceName)
    if (device && device._id) ids.add(device._id)
  })
  return ids
}

function normalizeRepairType(value) {
  const text = String(value || '').toLowerCase()
  return text === 'maintain' || text.includes('保养') || text.includes('maintenance') ? 'maintain' : 'repair'
}

function getRepairType(order = {}) {
  return normalizeRepairType(order.repairType || order.type || order.repairTypeLabel || order.typeLabel)
}

function orderTime(order) {
  const value = order.updatedAt || order.createdAt || ''
  if (typeof value === 'number') return value
  if (value && typeof value.getTime === 'function') return value.getTime()
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

async function getOpenDeviceOrders(device) {
  const base = {
    deleted: _.neq(true),
    status: _.neq('completed')
  }
  const tasks = [
    db.collection(WORKORDERS).where({
      ...base,
      deviceId: device._id
    }).field({
      _id: true,
      title: true,
      status: true,
      priority: true,
      repairType: true,
      type: true,
      repairTypeLabel: true,
      typeLabel: true,
      updatedAt: true,
      createdAt: true
    }).orderBy('updatedAt', 'desc').limit(50).get().catch(() => ({ data: [] }))
  ]

  if (device.name) {
    tasks.push(
      db.collection(WORKORDERS).where({
        ...base,
        deviceName: device.name
      }).field({
        _id: true,
        title: true,
        status: true,
        priority: true,
        repairType: true,
        type: true,
        repairTypeLabel: true,
        typeLabel: true,
        updatedAt: true,
        createdAt: true
      }).orderBy('updatedAt', 'desc').limit(50).get().catch(() => ({ data: [] }))
    )
  }

  const map = {}
  const results = await Promise.all(tasks)
  results.forEach(result => {
    ;(result.data || []).forEach(order => {
      if (order._id) map[order._id] = order
    })
  })

  return Object.keys(map)
    .map(id => map[id])
    .sort((a, b) => orderTime(b) - orderTime(a))
}

function getMaintainDeviceIdsFromOrders(device, orders = []) {
  return orders.some(order => getRepairType(order) === 'maintain') ? new Set([device._id]) : new Set()
}

function buildDeviceWorkorderNotices(orders = []) {
  const groups = orders.reduce((acc, order) => {
    const type = getRepairType(order)
    if (!acc[type]) acc[type] = []
    acc[type].push(order)
    return acc
  }, {})

  return ['repair', 'maintain'].filter(type => groups[type] && groups[type].length).map(type => {
    const order = groups[type][0]
    const isMaintain = type === 'maintain'
    return {
      id: order._id,
      orderId: order._id,
      type,
      repairType: type,
      count: groups[type].length,
      title: isMaintain ? '该设备待保养' : '该设备待检修',
      colorClass: isMaintain ? 'maintain' : 'repair',
      orderTitle: order.title || '',
      status: order.status || '',
      priority: order.priority || ''
    }
  })
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const user = await getUser(OPENID)
  if (!canView(user)) return fail(403, '无查看设备目录权限')

  const action = event.action || 'list'

  if (action === 'detail') {
    const id = event.id
    if (!id) return fail(400, '缺少设备 ID')
    const res = await db.collection(DEVICES).doc(id).get().catch(() => null)
    if (!res || !res.data || res.data.deleted) return ok(null)
    const [devicesWithUrls, openOrders] = await Promise.all([
      addFileAccessUrls([res.data], { includeAllImages: true, includeGuideFiles: true }),
      getOpenDeviceOrders(res.data)
    ])
    const maintainDeviceIds = getMaintainDeviceIdsFromOrders(res.data, openOrders)
    const device = normalizeDevice(devicesWithUrls[0], maintainDeviceIds)
    const workorderNotices = buildDeviceWorkorderNotices(openOrders)
    return ok({
      ...device,
      workorderNotices
    })
  }

  const page = Math.max(Number(event.page || 1), 1)
  const pageSize = Math.min(Math.max(Number(event.pageSize || 10), 1), 50)
  const base = { deleted: _.neq(true) }
  if (event.location && event.location !== '全部') base.location = event.location
  if (event.type && event.type !== '全部') base.type = event.type
  if (event.mineOnly) base.ownerOpenid = OPENID

  const allRes = await db.collection(DEVICES).where(base).field({
    _id: true,
    name: true,
    code: true,
    model: true,
    type: true,
    typeLabel: true,
    location: true,
    area: true,
    position: true,
    manufacturer: true,
    status: true,
    coverImage: true,
    images: true,
    updatedAt: true
  }).orderBy('updatedAt', 'desc').limit(1000).get()
  const maintainDeviceIds = await getMaintainDeviceIds(allRes.data)
  let list = allRes.data.map(device => normalizeDevice(device, maintainDeviceIds))
  const keyword = (event.keyword || '').trim().toLowerCase()
  if (keyword) {
    list = list.filter(item => {
      const text = [
        item.name,
        item.model,
        item.code,
        item.type,
        item.typeLabel,
        item.location,
        item.area,
        item.position,
        item.manufacturer
      ].filter(Boolean).join(' ').toLowerCase()
      return text.includes(keyword)
    })
  }

  const locations = Array.from(new Set(list.map(item => item.location).filter(Boolean)))
  const types = Array.from(new Set(list.map(item => item.type).filter(Boolean)))
  const start = (page - 1) * pageSize
  const pageList = await addFileAccessUrls(
    list.slice(start, start + pageSize).map(toDeviceListItem),
    { includeAllImages: false, includeGuideFiles: false }
  )

  return ok({
    list: pageList,
    total: list.length,
    hasMore: start + pageSize < list.length,
    locations: ['全部', ...locations],
    types: ['全部', ...types]
  })
}
