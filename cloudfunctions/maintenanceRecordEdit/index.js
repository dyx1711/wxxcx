const cloud = require('wx-server-sdk')

cloud.init({ env: 'dyx0214-d4gg0btzz41aeafe8' })

const db = cloud.database()
const _ = db.command
const RECORDS = 'maintenance_records'
const USERS = 'users'

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

function canEdit(user) {
  return user && (user.role === 'admin' || user.permissions && user.permissions.canEdit)
}

function pickRecord(input = {}) {
  return {
    deviceId: String(input.deviceId || '').trim(),
    deviceName: String(input.deviceName || '').trim(),
    type: String(input.type || '').trim(),
    date: String(input.date || '').trim(),
    operator: String(input.operator || '').trim(),
    result: String(input.result || '').trim(),
    content: String(input.content || '').trim(),
    files: Array.isArray(input.files) ? input.files.map(file => ({
      name: file.name || '',
      fileID: file.fileID || '',
      size: file.size || 0,
      type: file.type || ''
    })) : [],
    images: Array.isArray(input.images) ? input.images.map(image => ({
      name: image.name || '',
      fileID: image.fileID || '',
      size: image.size || 0,
      type: image.type || 'image'
    })) : []
  }
}

function validateFiles(files) {
  const allowed = ['doc', 'docx', 'pdf']
  return files.every(file => {
    const ext = (file.name || '').split('.').pop().toLowerCase()
    return file.fileID && allowed.includes(ext)
  })
}

function validateImages(images) {
  return images.every(image => image.fileID)
}

async function addFileAccessUrls(records = []) {
  const fileIDs = []
  records.forEach(record => {
    ;(record.files || []).forEach(file => {
      if (file.fileID) fileIDs.push(file.fileID)
    })
    ;(record.images || []).forEach(image => {
      if (image.fileID) fileIDs.push(image.fileID)
    })
  })

  const uniqueFileIDs = Array.from(new Set(fileIDs))
  if (!uniqueFileIDs.length) return records

  const urlMap = {}
  for (let i = 0; i < uniqueFileIDs.length; i += 50) {
    const fileList = uniqueFileIDs.slice(i, i + 50)
    const result = await cloud.getTempFileURL({ fileList }).catch(() => ({ fileList: [] }))
    ;(result.fileList || []).forEach(file => {
      if (file.fileID && file.tempFileURL) urlMap[file.fileID] = file.tempFileURL
    })
  }

  return records.map(record => ({
    ...record,
    files: (record.files || []).map(file => ({
      ...file,
      url: urlMap[file.fileID] || file.fileID
    })),
    images: (record.images || []).map(image => ({
      ...image,
      url: urlMap[image.fileID] || image.fileID
    }))
  }))
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const user = await getUser(OPENID)
  const action = event.action || 'list'

  if ((action === 'list' || action === 'detail') && !canView(user)) {
    return fail(403, '无查看维修保养记录权限')
  }
  if (!['list', 'detail'].includes(action) && !canEdit(user)) {
    return fail(403, '无编辑维修保养记录权限')
  }

  if (action === 'list') {
    const query = { deleted: _.neq(true) }
    if (event.deviceId) query.deviceId = event.deviceId
    const res = await db.collection(RECORDS).where(query).orderBy('date', 'desc').limit(200).get()
    const list = await addFileAccessUrls(res.data.map(item => ({ ...item, id: item._id })))
    return ok({ list, total: list.length })
  }

  if (action === 'detail') {
    const id = event.id
    if (!id) return fail(400, '缺少记录 ID')
    const res = await db.collection(RECORDS).doc(id).get().catch(() => null)
    if (!res || !res.data || res.data.deleted) return ok(null)
    const records = await addFileAccessUrls([{ ...res.data, id: res.data._id }])
    return ok(records[0])
  }

  if (action === 'create' || action === 'update') {
    const record = pickRecord(event.record)
    if (!record.deviceName || !record.type || !record.date || !record.operator) {
      return fail(400, '设备、类型、日期、操作人不能为空')
    }
    if (!record.content && !record.files.length && !record.images.length) {
      return fail(400, '请填写文字记录或上传文档/图片')
    }
    if (!validateFiles(record.files)) {
      return fail(400, '仅支持上传 Word 或 PDF 文件')
    }
    if (!validateImages(record.images)) {
      return fail(400, '图片上传信息不完整')
    }

    const now = db.serverDate()
    if (action === 'create') {
      const addRes = await db.collection(RECORDS).add({
        data: {
          ...record,
          deleted: false,
          createdAt: now,
          updatedAt: now,
          createdBy: OPENID,
          updatedBy: OPENID
        }
      })
      return ok({ id: addRes._id })
    }

    const id = event.record && (event.record._id || event.record.id)
    if (!id) return fail(400, '缺少记录 ID')
    await db.collection(RECORDS).doc(id).update({
      data: {
        ...record,
        updatedAt: now,
        updatedBy: OPENID
      }
    })
    return ok({ id })
  }

  if (action === 'delete') {
    if (!event.id) return fail(400, '缺少记录 ID')
    await db.collection(RECORDS).doc(event.id).update({
      data: {
        deleted: true,
        updatedAt: db.serverDate(),
        updatedBy: OPENID
      }
    })
    return ok({ id: event.id })
  }

  return fail(400, '不支持的操作')
}
