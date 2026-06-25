const cloud = require('wx-server-sdk')

cloud.init({ env: 'dyx0214-d4gg0btzz41aeafe8' })

const db = cloud.database()
const _ = db.command
const DEVICES = 'devices'
const USERS = 'users'
const WORKORDERS = 'repair_workorders'
const ENERGY = 'energy_records'

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

function canEdit(user) {
  return user && user.role === 'admin'
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function addMonths(date, months) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
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

function normalizeCycleMonths(value) {
  const months = Math.floor(Number(value || 0))
  if (!Number.isFinite(months) || months < 0) return 0
  return Math.min(months, 120)
}

function buildMaintenanceSchedule(input, nowDate = new Date()) {
  const maintenanceCycleMonths = normalizeCycleMonths(input.maintenanceCycleMonths)
  const lastDate = parseDateValue(input.maintenanceLastAt) ||
    parseDateValue(input.maintenanceLastAtText) ||
    (maintenanceCycleMonths ? nowDate : null)

  if (!maintenanceCycleMonths) {
    return {
      maintenanceCycleMonths: 0,
      maintenanceNextAt: null,
      maintenanceNextAtText: '',
      maintenanceLastAt: input.maintenanceLastAt || null,
      maintenanceLastAtText: input.maintenanceLastAtText || ''
    }
  }

  const nextDate = addMonths(lastDate, maintenanceCycleMonths)
  return {
    maintenanceCycleMonths,
    maintenanceLastAt: lastDate,
    maintenanceLastAtText: formatDate(lastDate),
    maintenanceNextAt: nextDate,
    maintenanceNextAtText: formatDate(nextDate)
  }
}

function pickDevice(input = {}) {
  const guideFiles = input.maintenanceGuide && Array.isArray(input.maintenanceGuide.files)
    ? input.maintenanceGuide.files.map(file => ({
      name: file.name || '',
      fileID: file.fileID || '',
      size: file.size || 0,
      type: file.type || ''
    })).filter(file => file.fileID)
    : []

  return {
    name: String(input.name || '').trim(),
    model: String(input.model || '').trim(),
    type: String(input.type || '').trim(),
    typeLabel: String(input.typeLabel || input.type || '').trim(),
    location: String(input.location || '').trim(),
    area: String(input.area || '').trim(),
    position: String(input.position || '').trim(),
    code: String(input.code || '').trim(),
    manufacturer: String(input.manufacturer || '').trim(),
    power: String(input.power || '').trim(),
    parameters: String(input.parameters || '').trim(),
    ...buildMaintenanceSchedule(input),
    maintenanceGuide: {
      text: String((input.maintenanceGuide && input.maintenanceGuide.text) || '').trim(),
      files: guideFiles
    },
    purchaseDate: String(input.purchaseDate || '').trim(),
    warrantyDate: String(input.warrantyDate || '').trim(),
    status: input.status || 'normal',
    images: Array.isArray(input.images) ? input.images.map(image => ({
      name: image.name || '',
      fileID: image.fileID || '',
      size: image.size || 0,
      type: image.type || 'image'
    })).filter(image => image.fileID) : [],
    coverImage: input.coverImage || (Array.isArray(input.images) && input.images[0] && input.images[0].fileID) || '',
    ownerOpenid: input.ownerOpenid || '',
    owner: input.owner || null
  }
}

async function deleteRelatedTodos(device, openid, now) {
  const res = await db.collection(WORKORDERS).where({
    deleted: _.neq(true),
    status: _.neq('completed')
  }).limit(1000).get().catch(() => ({ data: [] }))

  const related = res.data.filter(order => (
    order.deviceId === device._id ||
    (!order.deviceId && device.name && order.deviceName === device.name)
  ))

  const results = await Promise.all(related.map(order => db.collection(WORKORDERS).doc(order._id).update({
    data: {
      deleted: true,
      deletedAt: now,
      deletedBy: openid,
      deleteReason: 'device_deleted',
      updatedAt: now,
      updatedBy: openid
    }
  }).then(() => 1).catch(() => 0)))

  return results.reduce((sum, count) => sum + count, 0)
}

async function softDeleteEnergyRecords(records, openid, now) {
  const ids = Array.from(new Set(records.map(item => item && item._id).filter(Boolean)))
  if (!ids.length) return 0

  const results = await Promise.all(ids.map(id => db.collection(ENERGY).doc(id).update({
    data: {
      deleted: true,
      deletedAt: now,
      deletedBy: openid,
      deleteReason: 'device_deleted',
      updatedAt: now,
      updatedBy: openid
    }
  }).then(() => 1).catch(() => 0)))

  return results.reduce((sum, count) => sum + count, 0)
}

async function deleteRelatedEnergyData(device, openid, now) {
  let deletedCount = 0

  for (let i = 0; i < 20; i += 1) {
    const res = await db.collection(ENERGY).where({
      deleted: _.neq(true),
      deviceId: device._id
    }).field({
      _id: true
    }).limit(1000).get().catch(() => ({ data: [] }))

    if (!res.data.length) break
    deletedCount += await softDeleteEnergyRecords(res.data, openid, now)
    if (res.data.length < 1000) break
  }

  if (!device.name) return deletedCount

  for (let i = 0; i < 20; i += 1) {
    const res = await db.collection(ENERGY).where({
      deleted: _.neq(true),
      deviceName: device.name
    }).field({
      _id: true,
      deviceId: true
    }).limit(1000).get().catch(() => ({ data: [] }))

    const legacyRecords = res.data.filter(record => !record.deviceId || record.deviceId === device._id)
    if (legacyRecords.length) {
      deletedCount += await softDeleteEnergyRecords(legacyRecords, openid, now)
    }
    if (res.data.length < 1000 || !legacyRecords.length) break
  }

  return deletedCount
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const user = await getUser(OPENID)
  if (!canEdit(user)) return fail(403, '无编辑设备档案权限')

  const action = event.action || 'update'
  const now = db.serverDate()

  if (action === 'delete') {
    const id = event.id || event.device && (event.device._id || event.device.id)
    const deviceRes = id
      ? await db.collection(DEVICES).doc(id).get().catch(() => null)
      : null
    if (id && (!deviceRes || !deviceRes.data || deviceRes.data.deleted)) {
      return fail(404, '设备不存在或已删除')
    }
    if (!id) return fail(400, '缺少设备 ID')
    await db.collection(DEVICES).doc(id).update({
      data: {
        deleted: true,
        deletedAt: now,
        deletedBy: OPENID,
        updatedAt: now,
        updatedBy: OPENID
      }
    })
    const [deletedTodoCount, deletedEnergyCount] = await Promise.all([
      deleteRelatedTodos(deviceRes.data, OPENID, now),
      deleteRelatedEnergyData(deviceRes.data, OPENID, now)
    ])
    return ok({ id, deletedTodoCount, deletedEnergyCount })
  }

  const device = pickDevice(event.device)

  if (!device.name || !device.model || !device.type || !device.location) {
    return fail(400, '设备名称、型号、类型、位置不能为空')
  }

  if (action === 'create') {
    const addRes = await db.collection(DEVICES).add({
      data: {
        ...device,
        deleted: false,
        createdAt: now,
        updatedAt: now,
        createdBy: OPENID,
        updatedBy: OPENID
      }
    })
    return ok({ id: addRes._id })
  }

  if (action === 'update') {
    const id = event.device && (event.device._id || event.device.id)
    if (!id) return fail(400, '缺少设备 ID')
    await db.collection(DEVICES).doc(id).update({
      data: {
        ...device,
        updatedAt: now,
        updatedBy: OPENID
      }
    })
    return ok({ id })
  }

  return fail(400, '不支持的操作')
}
