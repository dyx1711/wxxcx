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

async function addFileAccessUrls(devices = []) {
  const fileIDs = []
  devices.forEach(device => {
    if (device.coverImage) fileIDs.push(device.coverImage)
    ;(device.images || []).forEach(image => {
      if (image.fileID) fileIDs.push(image.fileID)
    })
    const guide = device.maintenanceGuide || {}
    ;(guide.files || []).forEach(file => {
      if (file.fileID) fileIDs.push(file.fileID)
    })
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
    images: (device.images || []).map(image => ({
      ...image,
      url: urlMap[image.fileID] || image.fileID
    })),
    maintenanceGuide: {
      ...(device.maintenanceGuide || {}),
      files: ((device.maintenanceGuide && device.maintenanceGuide.files) || []).map(file => ({
        ...file,
        url: urlMap[file.fileID] || file.fileID
      }))
    }
  }))
}

async function getMaintainDeviceIds(devices) {
  if (!devices.length) return new Set()
  const maintainRes = await db.collection(WORKORDERS).where({
    deleted: _.neq(true),
    status: _.neq('completed'),
    repairType: 'maintain'
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
    const maintainDeviceIds = await getMaintainDeviceIds([res.data])
    const devices = await addFileAccessUrls([normalizeDevice(res.data, maintainDeviceIds)])
    return ok(devices[0])
  }

  const page = Math.max(Number(event.page || 1), 1)
  const pageSize = Math.min(Math.max(Number(event.pageSize || 10), 1), 50)
  const base = { deleted: _.neq(true) }
  if (event.location && event.location !== '全部') base.location = event.location
  if (event.type && event.type !== '全部') base.type = event.type
  if (event.mineOnly) base.ownerOpenid = OPENID

  const allRes = await db.collection(DEVICES).where(base).orderBy('updatedAt', 'desc').limit(1000).get()
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
  const pageList = await addFileAccessUrls(list.slice(start, start + pageSize))

  return ok({
    list: pageList,
    total: list.length,
    hasMore: start + pageSize < list.length,
    locations: ['全部', ...locations],
    types: ['全部', ...types]
  })
}
