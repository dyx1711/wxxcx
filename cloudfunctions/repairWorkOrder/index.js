const cloud = require('wx-server-sdk')

cloud.init({ env: 'dyx0214-d4gg0btzz41aeafe8' })

const db = cloud.database()
const _ = db.command
const WORKORDERS = 'repair_workorders'
const RECORDS = 'maintenance_records'
const USERS = 'users'
const DEVICES = 'devices'

function ok(data) {
  return { code: 0, data }
}

function fail(code, message, data) {
  return { code, message, data }
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

function displayName(user) {
  return user && (user.nickName || user.name) || '微信用户'
}

function formatNow() {
  const date = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDate(date) {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
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

function orderNo() {
  const date = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `BX-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${Date.now().toString().slice(-6)}`
}

function normalizeRepairType(value) {
  const text = String(value || '').toLowerCase()
  return text === 'maintain' || text.includes('保养') || text.includes('maintenance') ? 'maintain' : 'repair'
}

function getRepairType(order = {}) {
  return normalizeRepairType(order.repairType || order.type || order.repairTypeLabel || order.typeLabel)
}

function repairTypeLabel(value) {
  return normalizeRepairType(value) === 'maintain' ? '保养' : '维修'
}

function pickImages(input = []) {
  if (!Array.isArray(input)) return []
  return input.map(image => ({
    name: image.name || '',
    fileID: image.fileID || '',
    size: image.size || 0,
    type: image.type || 'image'
  })).filter(image => image.fileID)
}

function pickOrder(input = {}) {
  return {
    deviceId: String(input.deviceId || '').trim(),
    deviceName: String(input.deviceName || '').trim(),
    deviceType: String(input.deviceType || '').trim(),
    location: String(input.location || '').trim(),
    repairType: normalizeRepairType(input.repairType),
    title: String(input.title || '').trim(),
    faultType: String(input.faultType || '').trim(),
    description: String(input.description || '').trim(),
    priority: input.priority || 'normal',
    deadline: String(input.deadline || '').trim(),
    images: pickImages(input.images)
  }
}

function normalizeOrder(order) {
  const priorityMap = {
    urgent: '紧急',
    high: '高',
    normal: '普通',
    low: '低'
  }
  const kind = getRepairType(order)
  return {
    ...order,
    id: order._id,
    type: kind,
    typeLabel: repairTypeLabel(kind),
    repairType: kind,
    repairTypeLabel: repairTypeLabel(kind),
    priorityLabel: priorityMap[order.priority] || '普通',
    deadlineClass: order.priority === 'urgent' || order.priority === 'high' ? 'danger' : 'muted',
    assignee: order.assigneeName || '待派工',
    createdAt: order.createdAtText || ''
  }
}

async function addImageAccessUrls(orders = []) {
  const fileIDs = []
  orders.forEach(order => {
    ;(order.images || []).forEach(image => {
      if (image.fileID) fileIDs.push(image.fileID)
    })
    ;(order.traces || []).forEach(trace => {
      ;(trace.images || []).forEach(image => {
        if (image.fileID) fileIDs.push(image.fileID)
      })
    })
  })

  const uniqueFileIDs = Array.from(new Set(fileIDs))
  if (!uniqueFileIDs.length) return orders

  const urlMap = {}
  for (let i = 0; i < uniqueFileIDs.length; i += 50) {
    const fileList = uniqueFileIDs.slice(i, i + 50)
    const result = await cloud.getTempFileURL({ fileList }).catch(() => ({ fileList: [] }))
    ;(result.fileList || []).forEach(file => {
      if (file.fileID && file.tempFileURL) urlMap[file.fileID] = file.tempFileURL
    })
  }

  return orders.map(order => ({
    ...order,
    images: (order.images || []).map(image => ({
      ...image,
      url: urlMap[image.fileID] || image.fileID
    })),
    traces: (order.traces || []).map(trace => ({
      ...trace,
      images: (trace.images || []).map(image => ({
        ...image,
        url: urlMap[image.fileID] || image.fileID
      }))
    }))
  }))
}

async function getOrder(id) {
  const res = await db.collection(WORKORDERS).doc(id).get().catch(() => null)
  if (!res || !res.data || res.data.deleted) return null
  return res.data
}

async function getAssignableUser(openid) {
  const res = await db.collection(USERS).where({ openid, status: 'active' }).limit(1).get()
  return res.data[0]
}

function buildDeviceLookup(devices) {
  return devices.reduce((acc, device) => {
    acc.byId[device._id] = device
    if (device.name) acc.byName[device.name] = device
    return acc
  }, { byId: {}, byName: {} })
}

function orderHasActiveDevice(order, lookup) {
  if (order.deviceId) return !!lookup.byId[order.deviceId]
  return !!(order.deviceName && lookup.byName[order.deviceName])
}

async function resetDeviceMaintenanceSchedule(order = {}, openid = '') {
  if (!order.deviceId) return
  const deviceRes = await db.collection(DEVICES).doc(order.deviceId).get().catch(() => null)
  if (!deviceRes || !deviceRes.data || deviceRes.data.deleted) return

  const completedDate = new Date()
  const cycleMonths = normalizeCycleMonths(deviceRes.data.maintenanceCycleMonths)
  const data = {
    maintenanceLastAt: completedDate,
    maintenanceLastAtText: formatDate(completedDate),
    updatedAt: db.serverDate(),
    updatedBy: openid
  }

  if (cycleMonths) {
    const nextDate = addMonths(completedDate, cycleMonths)
    data.maintenanceNextAt = nextDate
    data.maintenanceNextAtText = formatDate(nextDate)
  } else {
    data.maintenanceNextAt = null
    data.maintenanceNextAtText = ''
  }

  await db.collection(DEVICES).doc(order.deviceId).update({ data }).catch(() => null)
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const user = await getUser(OPENID)
  const action = event.action || 'list'

  if (!canView(user)) return fail(403, '无工单查看权限')

  if (action === 'assignableUsers') {
    if (!canManage(user)) return fail(403, '无派工权限')
    const res = await db.collection(USERS).where({ status: 'active' }).limit(200).get()
    return ok({
      list: res.data.map(item => ({
        openid: item.openid,
        name: displayName(item),
        department: item.department || '',
        role: item.role || ''
      }))
    })
  }

  if (action === 'list') {
    const devicesRes = await db.collection(DEVICES).where({ deleted: _.neq(true) }).field({
      _id: true,
      name: true
    }).limit(1000).get()
    const deviceLookup = buildDeviceLookup(devicesRes.data)
    const query = { deleted: _.neq(true) }
    if (event.status && event.status !== 'all') query.status = event.status
    const res = await db.collection(WORKORDERS).where(query).field({
      _id: true,
      no: true,
      title: true,
      location: true,
      deviceId: true,
      deviceName: true,
      deviceType: true,
      status: true,
      repairType: true,
      type: true,
      repairTypeLabel: true,
      typeLabel: true,
      priority: true,
      deadline: true,
      assigneeOpenid: true,
      reporterOpenid: true,
      assigneeName: true,
      createdAtText: true,
      updatedAt: true
    }).orderBy('updatedAt', 'desc').limit(200).get()
    const activeDeviceOrders = res.data.filter(item => (
      item.status === 'completed' || orderHasActiveDevice(item, deviceLookup)
    ))
    let visible = (event.mineOnly || !canManage(user))
      ? activeDeviceOrders.filter(item => item.assigneeOpenid === OPENID || item.reporterOpenid === OPENID)
      : activeDeviceOrders
    if (event.repairType && event.repairType !== 'all') {
      visible = visible.filter(item => getRepairType(item) === normalizeRepairType(event.repairType))
    }

    const allRes = await db.collection(WORKORDERS).where({ deleted: _.neq(true) }).field({
      _id: true,
      deviceId: true,
      deviceName: true,
      status: true,
      repairType: true,
      type: true,
      repairTypeLabel: true,
      typeLabel: true,
      assigneeOpenid: true,
      reporterOpenid: true
    }).limit(200).get()
    const activeCountOrders = allRes.data.filter(item => (
      item.status === 'completed' || orderHasActiveDevice(item, deviceLookup)
    ))
    let countSource = (event.mineOnly || !canManage(user))
      ? activeCountOrders.filter(item => item.assigneeOpenid === OPENID || item.reporterOpenid === OPENID)
      : activeCountOrders
    if (event.repairType && event.repairType !== 'all') {
      countSource = countSource.filter(item => getRepairType(item) === normalizeRepairType(event.repairType))
    }
    const counts = countSource.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1
      return acc
    }, {})
    const list = visible.map(normalizeOrder)
    return ok({ list, total: visible.length, counts })
  }

  if (action === 'detail') {
    const order = await getOrder(event.id)
    if (!order) return ok(null)
    if (!canManage(user) && order.assigneeOpenid !== OPENID && order.reporterOpenid !== OPENID) {
      return fail(403, '无权查看该工单')
    }
    const orders = await addImageAccessUrls([normalizeOrder(order)])
    return ok(orders[0])
  }

  if (action === 'create') {
    const order = pickOrder(event.order)
    if (!order.deviceName || !order.title || !order.description) {
      return fail(400, '设备、标题、描述不能为空')
    }
    let device = null
    if (order.deviceId) {
      const deviceRes = await db.collection(DEVICES).doc(order.deviceId).get().catch(() => null)
      device = deviceRes && deviceRes.data
    }
    const kind = normalizeRepairType(order.repairType)
    const now = db.serverDate()
    const textTime = formatNow()
    const addRes = await db.collection(WORKORDERS).add({
      data: {
        ...order,
        repairType: kind,
        repairTypeLabel: repairTypeLabel(kind),
        no: orderNo(),
        type: kind,
        typeLabel: repairTypeLabel(kind),
        deviceName: order.deviceName || device && device.name || '',
        deviceType: order.deviceType || device && (device.type || device.typeLabel) || '',
        location: order.location || device && device.location || '',
        status: 'pending',
        reporterOpenid: OPENID,
        reporterName: displayName(user),
        assigneeOpenid: '',
        assigneeName: '',
        traces: [],
        progress: [
          { title: '工单创建', desc: `${textTime} · ${displayName(user)}`, done: true },
          { title: '等待派工', desc: '管理员派送给处理人', done: false }
        ],
        deleted: false,
        createdAt: now,
        updatedAt: now,
        createdAtText: textTime,
        updatedAtText: textTime,
        createdBy: OPENID,
        updatedBy: OPENID
      }
    })
    return ok({ id: addRes._id })
  }

  if (action === 'update') {
    if (!canManage(user)) return fail(403, '无编辑派工权限')
    const id = event.order && (event.order.id || event.order._id)
    if (!id) return fail(400, '缺少工单 ID')
    const order = pickOrder(event.order)
    await db.collection(WORKORDERS).doc(id).update({
      data: {
        ...order,
        repairTypeLabel: repairTypeLabel(order.repairType),
        type: order.repairType,
        typeLabel: repairTypeLabel(order.repairType),
        updatedAt: db.serverDate(),
        updatedAtText: formatNow(),
        updatedBy: OPENID
      }
    })
    return ok({ id })
  }

  if (action === 'dispatch') {
    if (!canManage(user)) return fail(403, '无派工权限')
    const order = await getOrder(event.id)
    if (!order) return fail(404, '工单不存在')
    const assignee = await getAssignableUser(event.assigneeOpenid)
    if (!assignee) return fail(400, '处理人不存在或未启用')
    const textTime = formatNow()
    const progress = Array.isArray(order.progress) ? order.progress : []
    progress.push({ title: '已派工', desc: `${textTime} · 派给 ${displayName(assignee)}`, done: true })
    await db.collection(WORKORDERS).doc(event.id).update({
      data: {
        assigneeOpenid: assignee.openid,
        assigneeName: displayName(assignee),
        status: 'pending',
        progress,
        updatedAt: db.serverDate(),
        updatedAtText: textTime,
        updatedBy: OPENID
      }
    })
    return ok({ id: event.id })
  }

  if (action === 'start') {
    const order = await getOrder(event.id)
    if (!order) return fail(404, '工单不存在')
    if (order.assigneeOpenid !== OPENID && !canManage(user)) return fail(403, '只有处理人可以处理该工单')
    const textTime = formatNow()
    const progress = Array.isArray(order.progress) ? order.progress : []
    progress.push({ title: '开始处理', desc: `${textTime} · ${displayName(user)}`, done: true })
    await db.collection(WORKORDERS).doc(event.id).update({
      data: {
        status: 'processing',
        progress,
        updatedAt: db.serverDate(),
        updatedAtText: textTime,
        updatedBy: OPENID
      }
    })
    return ok({ id: event.id })
  }

  if (action === 'complete') {
    const order = await getOrder(event.id)
    if (!order) return fail(404, '工单不存在')
    if (order.assigneeOpenid !== OPENID && !canManage(user)) return fail(403, '只有处理人可以完成该工单')
    const trace = {
      content: String(event.trace && event.trace.content || '').trim(),
      images: pickImages(event.trace && event.trace.images),
      createdBy: OPENID,
      createdByName: displayName(user),
      createdAtText: formatNow()
    }
    if (!trace.content && !trace.images.length) return fail(400, '请填写处理留痕或上传图片')
    const textTime = trace.createdAtText
    const traces = Array.isArray(order.traces) ? order.traces : []
    traces.push(trace)
    const progress = Array.isArray(order.progress) ? order.progress : []
    progress.push({ title: '处理完成', desc: `${textTime} · ${displayName(user)}`, done: true })
    await db.collection(WORKORDERS).doc(event.id).update({
      data: {
        status: 'completed',
        traces,
        progress,
        completedAt: db.serverDate(),
        completedAtText: textTime,
        updatedAt: db.serverDate(),
        updatedAtText: textTime,
        updatedBy: OPENID
      }
    })
    const kind = normalizeRepairType(order.repairType)
    await db.collection(RECORDS).add({
      data: {
        deviceId: order.deviceId || '',
        deviceName: order.deviceName || '',
        category: kind,
        type: kind === 'maintain' ? '保养处理' : '维修处理',
        date: textTime.slice(0, 10),
        operator: displayName(user),
        result: '已完成',
        content: trace.content,
        images: trace.images,
        files: [],
        sourceWorkorderId: event.id,
        deleted: false,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
        createdBy: OPENID,
        updatedBy: OPENID
      }
    })
    if (kind === 'maintain') {
      await resetDeviceMaintenanceSchedule(order, OPENID)
    }
    return ok({ id: event.id })
  }

  return fail(400, '不支持的操作')
}
