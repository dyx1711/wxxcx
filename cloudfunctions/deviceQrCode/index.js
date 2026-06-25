const cloud = require('wx-server-sdk')

cloud.init({ env: 'dyx0214-d4gg0btzz41aeafe8' })

const db = cloud.database()
const DEVICES = 'devices'
const USERS = 'users'

function ok(data) {
  return { code: 0, data }
}

function fail(code, message) {
  return { code, message }
}

function getQrBuffer(res) {
  if (Buffer.isBuffer(res)) return res
  if (res && Buffer.isBuffer(res.buffer)) return res.buffer
  return null
}

async function getUser(openid) {
  const res = await db.collection(USERS).where({ openid, status: 'active' }).limit(1).get()
  return res.data[0]
}

function canView(user) {
  return user && (user.role === 'admin' || user.permissions && user.permissions.canView)
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const user = await getUser(OPENID)
  if (!canView(user)) return fail(403, '无查看设备权限')

  const id = String(event.id || '').trim()
  if (!id) return fail(400, '缺少设备 ID')
  const envVersion = ['develop', 'trial', 'release'].includes(event.envVersion) ? event.envVersion : 'release'

  const deviceRes = await db.collection(DEVICES).doc(id).get().catch(() => null)
  if (!deviceRes || !deviceRes.data || deviceRes.data.deleted) return fail(404, '设备不存在')

  let codeRes
  try {
    codeRes = await cloud.openapi.wxacode.get({
      path: `pages/device-detail/device-detail?id=${encodeURIComponent(id)}`,
      width: 430,
      envVersion
    })
  } catch (err) {
    console.error('wxacode.get failed', err)
    return fail(500, err && err.errMsg ? err.errMsg : '二维码生成失败')
  }

  const fileContent = getQrBuffer(codeRes)
  if (!fileContent) {
    console.error('wxacode.get returned no buffer', codeRes)
    return fail(500, '二维码生成结果为空')
  }

  const cloudPath = `devices/qrcodes/${id}-${Date.now()}.png`
  let uploadRes
  try {
    uploadRes = await cloud.uploadFile({ cloudPath, fileContent })
  } catch (err) {
    console.error('upload qr failed', err)
    return fail(500, '二维码上传失败')
  }

  return ok({
    id,
    deviceName: deviceRes.data.name || '',
    fileID: uploadRes.fileID,
    cloudPath
  })
}
